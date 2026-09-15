import { Service } from 'typedi';
import fs from 'fs/promises';
import path from 'path';
import { Worktree, WorktreeModel } from '../data/worktree';
import { Repository } from '../data/repository';
import { SubscriptionModel } from '../data/subscription';
import RepositoryStorageService, { exists } from './repositoryStorage';
import { WorkspaceGuard, LockOwner } from './workspaceLocks';
import { WorkspaceError } from '../shared/workspaceError';
import { workspaceId } from '../shared/workspacePaths';
import { parsePorcelain, WorktreeGitStatus } from '../shared/worktreeStatus';
@Service()
export default class WorktreeService {
  constructor(readonly storage: RepositoryStorageService) {}
  async get(id: number) {
    workspaceId(id);
    const row = await WorktreeModel.findByPk(id);
    if (!row) throw new WorkspaceError('WORKTREE_NOT_FOUND', undefined, 404);
    return row;
  }
  async list(repositoryId?: number) {
    const rows = await WorktreeModel.findAll({
      where: repositoryId ? { repository_id: repositoryId } : {},
      order: [['id', 'DESC']],
    });
    return Promise.all(
      rows.map(async (row) => ({
        ...row.get({ plain: true }),
        subscriptions: (
          await SubscriptionModel.findAll({
            where: { worktree_id: row.id },
            attributes: ['id', 'name'],
          })
        ).map((s) => s.get({ plain: true })),
        lease: await this.storage.locks.probe('worktree', row.id!),
      })),
    );
  }
  async locked<T>(
    id: number,
    operation: string,
    action: (
      guard: WorkspaceGuard,
      repo: Repository,
      row: Awaited<ReturnType<WorktreeService['get']>>,
      bare: string,
    ) => Promise<T>,
  ) {
    const initial = await this.get(id);
    return this.storage.withRepository(
      initial.repository_id,
      operation,
      async (g, r) => {
        const row = await this.get(id);
        try {
          return await action(g, r, row, await this.storage.verify(g, r));
        } catch (e: any) {
          if (
            [
              'GIT_TIMEOUT',
              'GIT_OPERATION_FAILED',
              'WORKSPACE_HELPER_FAILED',
              'GIT_OUTPUT_LIMIT',
            ].includes(e.error_code)
          )
            await row.update({
              lifecycle_state: 'ERROR',
              last_error: e.error_code,
            });
          throw e;
        }
      },
      [id],
    );
  }
  async path(row: Worktree) {
    const target = await this.storage.paths.worktree(
      row.repository_id,
      row.id!,
    );
    if (row.local_path && row.local_path !== target)
      throw new WorkspaceError('PATH_CONFLICT');
    return target;
  }
  async registered(
    g: WorkspaceGuard,
    r: Repository,
    row: Worktree,
    bare: string,
  ) {
    const target = await this.path(row);
    return (await this.storage.registrations(g, r, bare)).find(
      (entry) => entry.path === target && !entry.bare,
    );
  }
  async verifyPath(row: Worktree, bare: string) {
    const target = await this.path(row),
      dotgit = path.join(target, '.git');
    await this.storage.paths.assertSafe(dotgit);
    const stat = await fs.lstat(dotgit);
    if (!stat.isFile()) throw new WorkspaceError('PATH_CONFLICT');
    const pointer = (await fs.readFile(dotgit, 'utf8'))
      .trim()
      .match(/^gitdir: (.+)$/);
    if (!pointer) throw new WorkspaceError('PATH_CONFLICT');
    const admin = path.resolve(target, pointer[1]);
    if (path.dirname(admin) !== path.join(bare, 'worktrees'))
      throw new WorkspaceError('PATH_CONFLICT');
    await this.storage.paths.assertSafe(admin);
    const backPointer = (
      await fs.readFile(path.join(admin, 'gitdir'), 'utf8')
    ).trim();
    if (path.resolve(admin, backPointer) !== dotgit)
      throw new WorkspaceError('PATH_CONFLICT');
    return target;
  }
  async snapshot(
    g: WorkspaceGuard,
    r: Repository,
    row: Awaited<ReturnType<WorktreeService['get']>>,
    bare: string,
  ) {
    const target = await this.path(row);
    if (!(await exists(target))) {
      await row.update({ lifecycle_state: 'MISSING' });
      return { ...row.get({ plain: true }), git: null };
    }
    if (!(await this.registered(g, r, row, bare))) {
      await row.update({ lifecycle_state: 'STALE' });
      return { ...row.get({ plain: true }), git: null };
    }
    await this.verifyPath(row, bare);
    const run = (args: string[], allow = false) =>
      this.storage.commands.run(g, r, args, target, false, allow);
    const actualRoot = (
      await run(['rev-parse', '--show-toplevel'])
    ).stdout.trim();
    if (actualRoot !== target) throw new WorkspaceError('PATH_CONFLICT');
    const head = (await run(['rev-parse', '--verify', 'HEAD'])).stdout.trim();
    const branchResult = await run(
        ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        true,
      ),
      branch = branchResult.code ? null : branchResult.stdout.trim();
    const flags = parsePorcelain(
      (
        await run([
          'status',
          '--porcelain=v1',
          '-z',
          '--untracked-files=all',
          '--ignored=matching',
        ])
      ).stdout,
    );
    let ahead: number | null = null,
      behind: number | null = null,
      remote_missing = false;
    const remoteBranch =
      row.ref_type === 'branch' ? `refs/remotes/origin/${row.ref_name}` : null;
    if (remoteBranch) {
      const counts = await run(
        ['rev-list', '--left-right', '--count', `HEAD...${remoteBranch}`],
        true,
      );
      if (counts.code) remote_missing = true;
      else [ahead, behind] = counts.stdout.trim().split(/\s+/).map(Number);
    }
    const git: WorktreeGitStatus = {
      ...flags,
      head,
      branch,
      remoteBranch,
      clean: flags.changed_files.length === 0,
      detached: !branch,
      ahead,
      behind,
      remote_missing,
    };
    const stale = row.ref_type === 'branch' && branch !== row.branch;
    await row.update({
      commit: head,
      lifecycle_state: stale ? 'STALE' : 'READY',
      dirty_state: flags.conflicted
        ? 'CONFLICT'
        : git.clean
        ? 'CLEAN'
        : 'DIRTY',
      status_snapshot: git,
      last_error: null,
    });
    return { ...row.get({ plain: true }), git };
  }
  async status(id: number) {
    const initial = await this.get(id);
    const lease = await this.storage.locks.probe('worktree', id);
    if (lease.busy)
      return {
        ...initial.get({ plain: true }),
        git: initial.status_snapshot || null,
        lease,
      };
    return this.storage.withRepository(
      initial.repository_id,
      'worktree-status',
      async (g, r) => {
        const row = await this.get(id);
        try {
          return {
            ...(await this.snapshot(
              g,
              r,
              row,
              await this.storage.verify(g, r),
            )),
            lease: { busy: false },
          };
        } catch (e: any) {
          await row.update({
            lifecycle_state: 'ERROR',
            last_error: e.error_code || 'STATUS_FAILED',
          });
          return {
            ...row.get({ plain: true }),
            git: null,
            error_code: e.error_code || 'STATUS_FAILED',
            lease: { busy: false },
          };
        }
      },
    );
  }
  validateRef(type: string, name: string) {
    if (
      !['branch', 'tag', 'commit'].includes(type) ||
      typeof name !== 'string' ||
      !name ||
      name.length > 255 ||
      name.startsWith('-') ||
      /[\x00-\x20\x7f~^:?*\[\\]/.test(name) ||
      name.includes('..') ||
      name.includes('@{') ||
      name.endsWith('/') ||
      name.includes('//')
    )
      throw new WorkspaceError('INVALID_REF');
    if (type === 'commit' && !/^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$/.test(name))
      throw new WorkspaceError('INVALID_REF');
  }
  async create(input: {
    repository_id: number;
    name: string;
    ref_type: 'branch' | 'tag' | 'commit';
    ref_name: string;
    purpose?: 'USER' | 'SUBSCRIPTION';
  }) {
    this.validateRef(input.ref_type, input.ref_name);
    if (!input.name?.trim() || input.name.length > 255)
      throw new WorkspaceError('INVALID_NAME');
    return this.storage.withRepository(
      input.repository_id,
      'create-worktree',
      async (g, r) => {
        const bare = await this.storage.verify(g, r);
        if (r.storage_state !== 'READY')
          throw new WorkspaceError('REPOSITORY_NOT_INITIALIZED');
        const branchKey =
          input.ref_type === 'branch' ? `${r.id}:${input.ref_name}` : null;
        if (
          branchKey &&
          (await WorktreeModel.findOne({ where: { branch_key: branchKey } }))
        )
          throw new WorkspaceError('BRANCH_ALREADY_CHECKED_OUT');
        const ref =
          input.ref_type === 'branch'
            ? `refs/remotes/origin/${input.ref_name}`
            : input.ref_type === 'tag'
            ? `refs/tags/${input.ref_name}`
            : input.ref_name;
        const resolved = await this.storage.commands.run(
          g,
          r,
          ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
          bare,
          false,
          true,
        );
        if (resolved.code) throw new WorkspaceError('REF_NOT_FOUND');
        const commit = resolved.stdout.trim();
        const row = await WorktreeModel.create({
          ...input,
          name: input.name.trim(),
          branch_key: branchKey,
          commit,
          target_commit: commit,
        });
        const target = await this.path(row),
          branch = input.ref_type === 'branch' ? `ql-worktree-${row.id}` : null;
        await row.update({ local_path: target, branch });
        try {
          await this.storage.paths.parents(target);
          if (await exists(target)) throw new WorkspaceError('PATH_CONFLICT');
          await this.storage.commands.run(
            g,
            r,
            [
              'worktree',
              'add',
              ...(branch ? ['-b', branch] : ['--detach']),
              '--',
              target,
              ref,
            ],
            bare,
          );
          if (branch)
            await this.storage.commands.run(
              g,
              r,
              ['branch', `--set-upstream-to=origin/${input.ref_name}`, branch],
              bare,
            );
          await row.update({ last_update_at: new Date() });
          return this.snapshot(g, r, row, bare);
        } catch (e: any) {
          await row.update({
            lifecycle_state: 'ERROR',
            last_error: e.error_code || 'CREATE_FAILED',
          });
          throw e;
        }
      },
    );
  }
  async ensure(input: {
    repository_id: number;
    name: string;
    ref_type: 'branch' | 'tag' | 'commit';
    ref_name: string;
    purpose?: 'USER' | 'SUBSCRIPTION';
  }) {
    const existing =
      input.ref_type === 'branch'
        ? await WorktreeModel.findOne({
            where: { branch_key: `${input.repository_id}:${input.ref_name}` },
          })
        : null;
    return existing ? this.status(existing.id!) : this.create(input);
  }
  clean(snapshot: any) {
    if (!snapshot.git)
      throw new WorkspaceError(
        snapshot.lifecycle_state === 'MISSING'
          ? 'WORKTREE_MISSING'
          : 'WORKTREE_STALE',
      );
    if (snapshot.git.conflicted) throw new WorkspaceError('WORKTREE_CONFLICT');
    if (!snapshot.git.clean) throw new WorkspaceError('WORKTREE_DIRTY');
  }
  safeLocalCommits(snapshot: any, row: Worktree) {
    if (row.ref_type === 'branch') {
      if (snapshot.git.remote_missing)
        throw new WorkspaceError('REF_NOT_FOUND');
      if (snapshot.git.ahead > 0)
        throw new WorkspaceError(
          snapshot.git.behind > 0
            ? 'WORKTREE_DIVERGED'
            : 'WORKTREE_LOCAL_COMMITS',
        );
      if (snapshot.git.branch !== row.branch)
        throw new WorkspaceError('WORKTREE_STALE');
    } else if (snapshot.git.head !== row.target_commit)
      throw new WorkspaceError('WORKTREE_LOCAL_COMMITS');
  }
  async update(id: number) {
    return this.locked(id, 'update-worktree', (g, r, row, bare) =>
      this.updateLocked(g, r, row, bare),
    );
  }
  private async updateLocked(
    g: WorkspaceGuard,
    r: Repository,
    row: Awaited<ReturnType<WorktreeService['get']>>,
    bare: string,
  ) {
    const snapshot = await this.snapshot(g, r, row, bare);
    this.clean(snapshot);
    if (row.ref_type !== 'branch' || snapshot.git!.detached)
      throw new WorkspaceError('DETACHED_HEAD');
    if (snapshot.git!.branch !== row.branch)
      throw new WorkspaceError('WORKTREE_STALE');
    if (snapshot.git!.remote_missing) throw new WorkspaceError('REF_NOT_FOUND');
    if (snapshot.git!.ahead! > 0 && snapshot.git!.behind! > 0)
      throw new WorkspaceError('WORKTREE_DIVERGED');
    if (snapshot.git!.ahead! > 0) return snapshot;
    const target = await this.verifyPath(row, bare);
    await this.storage.commands.run(
      g,
      r,
      [
        'merge',
        '--ff-only',
        '--no-edit',
        `refs/remotes/origin/${row.ref_name}`,
      ],
      target,
    );
    await row.update({ last_update_at: new Date() });
    return this.snapshot(g, r, row, bare);
  }
  async withSync<T>(
    id: number,
    action: (state: {
      before: string;
      after: string;
      worktree: Worktree;
      guard: WorkspaceGuard;
    }) => Promise<T>,
  ) {
    return this.locked(id, 'SUBSCRIPTION_SYNC', async (g, r, row, bare) => {
      const initial = await this.snapshot(g, r, row, bare);
      this.clean(initial);
      this.safeLocalCommits(initial, row);
      const updated = await this.updateLocked(g, r, row, bare);
      this.clean(updated);
      this.safeLocalCommits(updated, row);
      if (updated.git!.ahead !== 0 || updated.git!.behind !== 0)
        throw new WorkspaceError('WORKTREE_NOT_AT_REMOTE');
      return action({
        before: initial.git!.head!,
        after: updated.git!.head!,
        worktree: row.get({ plain: true }),
        guard: g,
      });
    });
  }
  private async assertUnreferenced(id: number) {
    const subscriptions = await SubscriptionModel.findAll({
      where: { worktree_id: id },
      attributes: ['id'],
    });
    if (subscriptions.length)
      throw new WorkspaceError(
        'WORKTREE_IN_USE',
        `Worktree is used by subscriptions: ${subscriptions
          .map((s) => s.id)
          .join(', ')}`,
      );
  }
  async rename(id: number, name: string) {
    if (!name?.trim() || name.length > 255)
      throw new WorkspaceError('INVALID_NAME');
    return this.locked(id, 'rename-worktree', async (_g, _r, row) => {
      await row.update({ name: name.trim() });
      return row;
    });
  }
  async remove(id: number) {
    return this.locked(id, 'delete-worktree', async (g, r, row, bare) => {
      await this.assertUnreferenced(id);
      const snapshot = await this.snapshot(g, r, row, bare);
      this.clean(snapshot);
      this.safeLocalCommits(snapshot, row);
      await row.update({ lifecycle_state: 'DELETING' });
      await this.storage.commands.run(
        g,
        r,
        ['worktree', 'remove', '--', await this.path(row)],
        bare,
      );
      if (row.branch)
        await this.storage.commands.run(
          g,
          r,
          ['branch', '-d', '--', row.branch],
          bare,
        );
      await row.destroy();
      return null;
    });
  }
  async repair(id: number) {
    return this.locked(id, 'repair-worktree', async (g, r, row, bare) => {
      const target = await this.path(row),
        registration = await this.registered(g, r, row, bare);
      if (!(await exists(target))) {
        if (registration)
          throw new WorkspaceError(
            'WORKTREE_STALE',
            'Prune missing worktree metadata before reconstructing this workspace',
          );
        await this.storage.paths.parents(target);
        const branchExists = row.branch
          ? await this.storage.commands.run(
              g,
              r,
              ['rev-parse', '--verify', `refs/heads/${row.branch}`],
              bare,
              false,
              true,
            )
          : null;
        const recreate = !!row.branch && branchExists?.code !== 0;
        await this.storage.commands.run(
          g,
          r,
          [
            'worktree',
            'add',
            ...(row.branch
              ? recreate
                ? ['-b', row.branch]
                : []
              : ['--detach']),
            '--',
            target,
            recreate
              ? row.commit || row.target_commit!
              : row.branch || row.target_commit!,
          ],
          bare,
        );
        if (recreate)
          await this.storage.commands.run(
            g,
            r,
            ['branch', `--set-upstream-to=origin/${row.ref_name}`, row.branch!],
            bare,
          );
      } else {
        const snapshot = await this.snapshot(g, r, row, bare);
        this.clean(snapshot);
        await this.storage.commands.run(
          g,
          r,
          ['worktree', 'repair', '--', target],
          bare,
        );
      }
      return this.snapshot(g, r, row, bare);
    });
  }
  async removeRecord(id: number) {
    return this.locked(id, 'remove-missing-record', async (g, r, row, bare) => {
      await this.assertUnreferenced(id);
      if (await exists(await this.path(row)))
        throw new WorkspaceError(
          'PATH_CONFLICT',
          'Only a missing workspace record can be removed',
        );
      if (await this.registered(g, r, row, bare))
        throw new WorkspaceError(
          'WORKTREE_STALE',
          'Prune missing Git metadata first',
        );
      if (row.branch) {
        const branchExists = await this.storage.commands.run(
          g,
          r,
          ['rev-parse', '--verify', `refs/heads/${row.branch}`],
          bare,
          false,
          true,
        );
        const ancestor = await this.storage.commands.run(
          g,
          r,
          [
            'merge-base',
            '--is-ancestor',
            branchExists.code ? row.commit || row.target_commit! : row.branch,
            `refs/remotes/origin/${row.ref_name}`,
          ],
          bare,
          false,
          true,
        );
        if (ancestor.code) throw new WorkspaceError('WORKTREE_LOCAL_COMMITS');
        if (!branchExists.code)
          await this.storage.commands.run(
            g,
            r,
            ['branch', '-d', '--', row.branch],
            bare,
          );
      } else if (row.commit !== row.target_commit)
        throw new WorkspaceError('WORKTREE_LOCAL_COMMITS');
      await row.destroy();
      return null;
    });
  }
  async acquireExecutionLease(id: number, owner: Omit<LockOwner, 'operation'>) {
    const row = await this.get(id);
    return this.storage.withRepository(
      row.repository_id,
      'acquire-execution-lease',
      async (g, r) => {
        const current = await this.get(id);
        const bare = await this.storage.verify(g, r);
        const lease = (await this.storage.locks.acquire(
          [{ kind: 'worktree', id }],
          { ...owner, operation: 'EXECUTION' },
        )) as WorkspaceGuard;
        try {
          const state = await this.snapshot(g, r, current, bare);
          if (!state.git) throw new WorkspaceError('WORKTREE_MISSING');
          return lease;
        } catch (e) {
          await lease.release();
          throw e;
        }
      },
    );
  }
}
