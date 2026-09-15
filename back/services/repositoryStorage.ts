import { Service, Container } from 'typedi';
import fs from 'fs/promises';
import path from 'path';
import config from '../config';
import { Repository, RepositoryModel } from '../data/repository';
import { WorktreeModel } from '../data/worktree';
import { SubscriptionModel } from '../data/subscription';
import { EnvironmentProfileModel } from '../data/scopedEnv';
import { sequelize } from '../data';
import { normalizeRepositoryUrl } from '../shared/gitProvider';
import { WorkspaceError } from '../shared/workspaceError';
import { RepositoryPathResolver, workspaceId } from '../shared/workspacePaths';
import { WorkspaceLocks, WorkspaceGuard } from './workspaceLocks';
import GitCommandService from './gitCommand';
export async function exists(file: string) {
  try {
    await fs.lstat(file);
    return true;
  } catch (e: any) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
export function parseWorktreeList(text: string) {
  const entries: any[] = [];
  let entry: any;
  for (const field of text.split('\0')) {
    if (field.startsWith('worktree ')) {
      entry = { path: field.slice(9) };
      entries.push(entry);
    } else if (entry && field) {
      const split = field.indexOf(' ');
      entry[split < 0 ? field : field.slice(0, split)] =
        split < 0 ? true : field.slice(split + 1);
    }
  }
  return entries;
}
@Service()
export default class RepositoryStorageService {
  readonly paths = new RepositoryPathResolver(config.dataPath);
  readonly locks = new WorkspaceLocks(this.paths);
  constructor(readonly commands: GitCommandService) {}
  async get(id: number) {
    workspaceId(id);
    const repo = await RepositoryModel.findByPk(id);
    if (!repo) throw new WorkspaceError('REPOSITORY_NOT_FOUND', undefined, 404);
    return repo.get({ plain: true });
  }
  async mark(id: number, fields: Partial<Repository>) {
    const [count] = await RepositoryModel.update(fields, { where: { id } });
    if (!count)
      throw new WorkspaceError('REPOSITORY_NOT_FOUND', undefined, 404);
  }
  audit(operation: string, id: number, result = 'OK') {
    if (Container.has('logger'))
      (Container.get('logger') as any).info(
        'Git workspace operation=%s repository=%d result=%s',
        operation,
        id,
        result,
      );
  }
  async withRepository<T>(
    id: number,
    operation: string,
    action: (guard: WorkspaceGuard, repo: Repository) => Promise<T>,
    worktrees: number[] = [],
  ) {
    return this.locks.with(
      [
        { kind: 'repository', id },
        ...worktrees
          .sort((a, b) => a - b)
          .map((id) => ({ kind: 'worktree' as const, id })),
      ],
      operation,
      async (guard) => {
        try {
          const result = await action(guard, await this.get(id));
          this.audit(operation, id);
          return result;
        } catch (e: any) {
          this.audit(operation, id, e.error_code || 'FAILED');
          throw e;
        }
      },
    );
  }
  async location(repo: Repository) {
    const target = await this.paths.repository(repo);
    if (repo.storage_path && repo.storage_path !== target)
      throw new WorkspaceError('PATH_CONFLICT');
    return target;
  }
  async verify(guard: WorkspaceGuard, repo: Repository, checkOrigin = true) {
    const target = await this.location(repo);
    if (!(await exists(target)))
      throw new WorkspaceError('REPOSITORY_NOT_INITIALIZED');
    await this.paths.noSymlinks(target);
    if (!(await fs.stat(target)).isDirectory())
      throw new WorkspaceError('PATH_CONFLICT');
    const configuration = path.join(target, 'config');
    if (
      !(await exists(configuration)) ||
      /^\s*\[\s*include(?:If)?\b/im.test(
        await fs.readFile(configuration, 'utf8'),
      )
    )
      throw new WorkspaceError('PATH_CONFLICT');
    const alternates = path.join(target, 'objects/info/alternates');
    if (await exists(alternates)) throw new WorkspaceError('PATH_CONFLICT');
    const bare = await this.commands.run(
      guard,
      repo,
      ['rev-parse', '--is-bare-repository'],
      target,
      false,
      true,
    );
    const marker = await this.commands.run(
      guard,
      repo,
      ['config', '--get', 'qinglong.repositoryId'],
      target,
      false,
      true,
    );
    if (
      bare.code ||
      bare.stdout.trim() !== 'true' ||
      marker.stdout.trim() !== String(repo.id)
    )
      throw new WorkspaceError(
        'PATH_CONFLICT',
        'PATH_CONFLICT: storage is not this managed bare repository',
      );
    if (checkOrigin) {
      const remote = await this.commands.run(
        guard,
        repo,
        ['remote', 'get-url', 'origin'],
        target,
        false,
        true,
      );
      if (remote.code || remote.stdout.trim() !== repo.remote_url)
        throw new WorkspaceError('REMOTE_MISMATCH');
    }
    return target;
  }
  async initialize(id: number) {
    return this.withRepository(id, 'initialize', async (guard, stored) => {
      const repo = stored;
      const target = await this.location(repo);
      if (await exists(target)) {
        await this.verify(guard, repo);
        await this.metadata(guard, repo, target);
        return this.get(id);
      }
      if (await WorktreeModel.count({ where: { repository_id: id } }))
        throw new WorkspaceError(
          'REPOSITORY_HAS_WORKTREES',
          'Restore the missing object store before repairing its worktrees',
        );
      await this.mark(id, {
        storage_state: 'INITIALIZING',
        storage_path: target,
        last_error: null,
      });
      try {
        await this.paths.parents(target);
        await fs.mkdir(target, { mode: 0o700 });
        await this.commands.run(
          guard,
          repo,
          ['init', '--bare', target],
          config.dataPath,
        );
        await this.commands.run(
          guard,
          repo,
          ['config', 'qinglong.repositoryId', String(id)],
          target,
        );
        await this.commands.run(
          guard,
          repo,
          ['remote', 'add', 'origin', repo.remote_url],
          target,
        );
        await this.configureFetch(guard, repo, target);
        await this.fetchLocked(guard, repo, target);
        return this.get(id);
      } catch (e: any) {
        await this.mark(id, {
          storage_state: 'ERROR',
          last_error: e.error_code || 'INITIALIZE_FAILED',
        });
        throw e;
      }
    });
  }
  async configureFetch(
    guard: WorkspaceGuard,
    repo: Repository,
    target: string,
  ) {
    await this.commands.run(
      guard,
      repo,
      [
        'config',
        '--replace-all',
        'remote.origin.fetch',
        '+refs/heads/*:refs/remotes/origin/*',
      ],
      target,
    );
  }
  async metadata(guard: WorkspaceGuard, repo: Repository, target: string) {
    const refs = await this.refsLocked(guard, repo, target);
    const head = await this.commands.run(
      guard,
      repo,
      ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'],
      target,
      false,
      true,
    );
    const defaultBranch = head.code
      ? null
      : head.stdout.trim().replace(/^refs\/remotes\/origin\//, '');
    const defaultRef = refs.find(
      (r) => r.type === 'branch' && r.name === defaultBranch,
    );
    await this.mark(repo.id!, {
      storage_state: 'READY',
      storage_path: target,
      remote_refs_count: refs.filter((r) => r.type === 'branch').length,
      tags_count: refs.filter((r) => r.type === 'tag').length,
      default_branch: defaultBranch,
      last_known_remote_head: defaultRef?.commit || null,
      last_error: null,
    });
  }
  async fetchLocked(guard: WorkspaceGuard, repo: Repository, target: string) {
    await this.commands.run(
      guard,
      repo,
      [
        'fetch',
        '--prune',
        'origin',
        '+refs/heads/*:refs/remotes/origin/*',
        '+refs/tags/*:refs/tags/*',
      ],
      target,
      true,
    );
    await this.commands.run(
      guard,
      repo,
      ['remote', 'set-head', 'origin', '--auto'],
      target,
      true,
      true,
    );
    await this.metadata(guard, repo, target);
    await this.mark(repo.id!, {
      last_fetch_at: new Date(),
      last_fetch_status: 'OK',
    });
  }
  async fetch(id: number) {
    return this.withRepository(id, 'fetch', async (guard, stored) => {
      const repo = stored;
      const target = await this.verify(guard, repo);
      await this.mark(id, { storage_state: 'FETCHING', last_error: null });
      try {
        await this.fetchLocked(guard, repo, target);
        return this.get(id);
      } catch (e: any) {
        await this.mark(id, {
          storage_state: 'ERROR',
          last_fetch_status: 'FAILED',
          last_error: e.error_code || 'FETCH_FAILED',
        });
        throw e;
      }
    });
  }
  async refsLocked(guard: WorkspaceGuard, repo: Repository, target: string) {
    const result = await this.commands.run(
      guard,
      repo,
      [
        'for-each-ref',
        '--format=%(refname)%00%(objectname)%00%(committerdate:iso-strict)',
        'refs/remotes/origin/',
        'refs/tags/',
      ],
      target,
    );
    return result.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [ref, commit, updated] = line.split('\0');
        return {
          ref,
          commit,
          updated,
          type: ref.startsWith('refs/tags/') ? 'tag' : 'branch',
          name: ref.replace(/^refs\/(remotes\/origin|tags)\//, ''),
        };
      })
      .filter((r) => r.name !== 'HEAD');
  }
  async refs(id: number) {
    return this.withRepository(id, 'refs', async (g, r) =>
      this.refsLocked(g, r, await this.verify(g, r)),
    );
  }
  async registrations(guard: WorkspaceGuard, repo: Repository, target: string) {
    return parseWorktreeList(
      (
        await this.commands.run(
          guard,
          repo,
          ['worktree', 'list', '--porcelain', '-z'],
          target,
        )
      ).stdout,
    );
  }
  async diagnostics(id: number) {
    const busy = await this.locks.probe('repository', id);
    if (busy.busy) return { repository: await this.get(id), lock: busy };
    return this.withRepository(id, 'diagnostics', async (guard, repo) => {
      const target = await this.location(repo);
      if (!(await exists(target))) {
        const state = repo.storage_path ? 'MISSING' : 'UNINITIALIZED';
        await this.mark(id, { storage_state: state });
        return {
          repository: await this.get(id),
          exists: false,
          lock: { busy: false },
          worktrees: [],
          orphans: [],
        };
      }
      try {
        await this.verify(guard, repo);
        const registrations = await this.registrations(guard, repo, target);
        const rows = await WorktreeModel.findAll({
          where: { repository_id: id },
        });
        const fsck = await this.commands.run(
          guard,
          repo,
          ['fsck', '--connectivity-only', '--no-dangling'],
          target,
          false,
          true,
        );
        if (fsck.code) throw new WorkspaceError('REPOSITORY_CORRUPT');
        await this.metadata(guard, repo, target);
        return {
          repository: await this.get(id),
          exists: true,
          is_bare: true,
          origin_matches: true,
          lock: { busy: false },
          worktrees: registrations,
          orphans: registrations.filter(
            (entry) =>
              !entry.bare && !rows.some((row) => row.local_path === entry.path),
          ),
        };
      } catch (e: any) {
        await this.mark(id, {
          storage_state: 'ERROR',
          last_error: e.error_code || 'DIAGNOSTICS_FAILED',
        });
        return {
          repository: await this.get(id),
          exists: true,
          error_code: e.error_code || 'DIAGNOSTICS_FAILED',
          lock: { busy: false },
        };
      }
    });
  }
  async prune(id: number) {
    // Repository lock freezes the worktree set; take every known worktree lease before pruning metadata.
    return this.withRepository(id, 'prune', async (g, r) => {
      const target = await this.verify(g, r),
        rows = await WorktreeModel.findAll({
          where: { repository_id: id },
          order: [['id', 'ASC']],
        });
      return this.locks.with(
        rows.map((row) => ({ kind: 'worktree', id: row.id! })),
        'prune',
        async () => {
          await this.commands.run(
            g,
            r,
            ['worktree', 'prune', '--expire', 'now'],
            target,
          );
          for (const row of rows)
            if (!(await exists(await this.paths.worktree(id, row.id!))))
              await row.update({ lifecycle_state: 'MISSING' });
          return this.registrations(g, r, target);
        },
      );
    });
  }
  async changeRemote(id: number, remote: string) {
    const identity = normalizeRepositoryUrl(remote);
    return this.withRepository(id, 'remote', async (g, r) => {
      if (identity.normalized_url !== r.normalized_url)
        throw new WorkspaceError('REMOTE_IDENTITY_CHANGED');
      await sequelize.transaction(async (transaction) => {
        await RepositoryModel.update(identity, { where: { id }, transaction });
      });
      const updated = await this.get(id),
        target = await this.location(updated);
      if (await exists(target)) {
        await this.verify(g, updated, false);
        await this.commands.run(
          g,
          updated,
          ['remote', 'set-url', 'origin', remote],
          target,
        );
      }
      return updated;
    });
  }
  async repair(id: number) {
    return this.withRepository(id, 'repair', async (g, r) => {
      const target = await this.verify(g, r, false);
      await this.commands.run(
        g,
        r,
        ['remote', 'set-url', 'origin', r.remote_url],
        target,
      );
      await this.configureFetch(g, r, target);
      await this.metadata(g, r, target);
      return this.get(id);
    });
  }
  async remove(id: number) {
    return this.withRepository(id, 'delete-repository', async (g, r) => {
      await sequelize.transaction(async (transaction) => {
        if (
          (await SubscriptionModel.count({
            where: { repository_id: id },
            transaction,
          })) ||
          (await WorktreeModel.count({
            where: { repository_id: id },
            transaction,
          })) ||
          (await EnvironmentProfileModel.count({
            where: { repository_id: id },
            transaction,
          }))
        )
          throw new WorkspaceError('REPOSITORY_IN_USE');
        await RepositoryModel.update(
          { storage_state: 'DELETING' },
          { where: { id }, transaction },
        );
      });
      const target = await this.location(r);
      if (await exists(target)) {
        await this.verify(g, r, false);
        const registered = await this.registrations(g, r, target);
        if (registered.some((x) => !x.bare))
          throw new WorkspaceError('REPOSITORY_HAS_WORKTREES');
        await this.paths.noSymlinks(target);
        await fs.rm(target, { recursive: true });
      }
      await RepositoryModel.destroy({ where: { id } });
      return null;
    });
  }
}
