import { Service } from 'typedi';
import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import config from '../config';
import WorktreeService from './worktree';
import { PlatformMutation } from './backup/platform';
import {
  WorkspaceFiles,
  workspaceRelative,
  workspaceFail,
} from './workspaceFiles';
import { parsePorcelain } from '../shared/worktreeStatus';
import { SystemModel, AuthDataType } from '../data/system';
import TaskReferenceService from './taskReferences';
import { SubscriptionModel } from '../data/subscription';

@Service()
export default class CodeWorkspaceService {
  constructor(private worktrees: WorktreeService) {}
  /** Read operations also lock: temporary execution Configs are never visible. */
  async access<T>(
    id: number,
    action: (
      files: WorkspaceFiles,
      run: (
        args: string[],
        network?: boolean,
        allow?: boolean,
        outputLimit?: number,
      ) => Promise<any>,
      row: any,
      repo: any,
    ) => Promise<T>,
  ) {
    const initial = await this.worktrees.get(id);
    return this.worktrees.storage.withRepository(
      initial.repository_id,
      'CODE_WORKSPACE',
      async (guard, repo) => {
        const row = await this.worktrees.get(id),
          bare = await this.worktrees.storage.verify(guard, repo);
        if (!(await this.worktrees.registered(guard, repo, row, bare)))
          workspaceFail('WORKTREE_STALE');
        const root = await this.worktrees.verifyPath(row, bare);
        const gitConfig = await fs.readFile(path.join(bare, 'config'), 'utf8');
        if (
          /^\s*\[\s*(?:filter|diff|include|includeIf)\b/im.test(gitConfig) ||
          /^\s*(?:worktreeConfig|worktree)\s*=/im.test(gitConfig)
        )
          workspaceFail('WORKSPACE_GIT_CONFIG_UNSAFE');
        // Journals can survive a crashed execution after its EX lease disappears.
        // Fail closed until the execution recovery owner restores original files.
        const resourceKey = createHash('sha256')
          .update(`worktree:${id}`)
          .digest('hex');
        const journalRoot = path.join(
          config.dataPath,
          'tmp/config-materialization',
          resourceKey,
        );
        const entries = await fs.readdir(journalRoot).catch((e) => {
          if (e.code === 'ENOENT') return [];
          throw e;
        });
        if (
          entries.length ||
          (await fs
            .lstat(
              path.join(
                config.dataPath,
                'tmp/execution/node-bindings',
                `worktree-${id}.json`,
              ),
            )
            .then(
              () => true,
              (e) => {
                if (e.code === 'ENOENT') return false;
                throw e;
              },
            ))
        )
          workspaceFail('WORKSPACE_RECOVERY_REQUIRED');
        const run = (
          args: string[],
          network = false,
          allow = false,
          outputLimit?: number,
        ) =>
          this.worktrees.storage.commands.run(
            guard,
            repo,
            args,
            root,
            network,
            allow,
            { push: network, outputLimit },
          );
        return action(
          new WorkspaceFiles(root, async (source, target) => {
            const result = await guard.run(
              [source, target],
              root,
              { PATH: '/usr/bin:/bin' },
              5000,
              'workspace-rename',
            );
            if (result.code)
              throw Object.assign(new Error('WORKSPACE_RENAME_FAILED'), {
                code: result.code,
              });
          }),
          run,
          row,
          repo,
        );
      },
      [id],
    );
  }
  async info(id: number) {
    return this.access(id, async (_files, run, row, repo) => {
      const head = await run(['rev-parse', '--verify', 'HEAD'], false, true);
      const branch = await run(
        ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        false,
        true,
      );
      const upstream = await run(
        ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
        false,
        true,
      );
      const counts = upstream.code
        ? null
        : await run(
            ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
            false,
            true,
          );
      const [ahead, behind] =
        counts && !counts.code
          ? counts.stdout.trim().split(/\s+/).map(Number)
          : [null, null];
      const refs = await new TaskReferenceService().worktree(id);
      return {
        id,
        name: row.name,
        repository: { id: repo.id, name: repo.name },
        head: head.code ? null : head.stdout.trim(),
        branch: branch.code ? null : branch.stdout.trim(),
        upstream: upstream.code ? null : upstream.stdout.trim(),
        ahead,
        behind,
        tasks_count: refs.tasks_count,
        subscriptions: (
          await SubscriptionModel.findAll({
            where: { worktree_id: id },
            attributes: ['id', 'name'],
          })
        ).map((s) => s.get({ plain: true })),
        identity: await this.identity(),
      };
    });
  }
  async identity() {
    const row = await SystemModel.findOne({
      where: { type: 'workspaceGitIdentity' as AuthDataType },
    });
    const value = row?.info as any;
    return value ? { name: value.name, email: value.email } : null;
  }
  @PlatformMutation()
  async setIdentity(value: { name: string; email: string }) {
    if (
      !value.name?.trim() ||
      value.name.length > 200 ||
      /[<>\x00-\x1f\x7f]/.test(value.name) ||
      !/^[^\s<>@]+@[^\s<>@]+$/.test(value.email) ||
      value.email.length > 254
    )
      workspaceFail('GIT_IDENTITY_REQUIRED', 400);
    const existing = await SystemModel.findOne({
      where: { type: 'workspaceGitIdentity' as AuthDataType },
    });
    const info = { name: value.name.trim(), email: value.email } as any;
    if (existing) await existing.update({ info });
    else
      await SystemModel.create({
        type: 'workspaceGitIdentity' as AuthDataType,
        info,
      });
    return this.identity();
  }
  tree(id: number, relative: string, offset: number, limit: number) {
    return this.access(id, (f) => f.tree(relative, offset, limit));
  }
  read(id: number, relative: string) {
    return this.access(id, async (f, run) => ({
      ...(await f.read(relative)),
      git:
        parsePorcelain(
          (
            await run([
              'status',
              '--porcelain=v1',
              '-z',
              '--untracked-files=all',
              '--',
              workspaceRelative(relative),
            ])
          ).stdout,
        ).changed_files[0] || null,
    }));
  }
  search(id: number, query: string, content: boolean) {
    return this.access(id, (f) => f.search(query, content));
  }
  @PlatformMutation()
  async mutate(
    id: number,
    operation: 'save' | 'create' | 'mkdir' | 'remove' | 'rename',
    input: any,
  ) {
    return this.access<any>(id, (f) => {
      switch (operation) {
        case 'save':
          return f.save(input.path, input.content, input.expected_hash);
        case 'create':
          if (input.must_not_exist !== true)
            workspaceFail('WORKSPACE_DESTINATION_EXISTS');
          return f.create(input.path, input.content);
        case 'mkdir':
          return f.create(input.path, '', true);
        case 'remove':
          return f.remove(input.path, input.expected_hash);
        case 'rename':
          return f.rename(input.path, input.destination, input.expected_hash);
      }
    });
  }
  async status(id: number, offset = 0, limit = 200) {
    return this.access(id, async (_f, run) => {
      const state = parsePorcelain(
        (
          await run([
            'status',
            '--porcelain=v1',
            '-z',
            '--untracked-files=all',
            '--ignore-submodules=all',
          ])
        ).stdout,
      );
      for (const file of state.changed_files) workspaceRelative(file.path);
      const total = state.changed_files.length;
      return {
        ...state,
        changed_files: state.changed_files.slice(offset, offset + limit),
        total,
        next: offset + limit < total ? offset + limit : null,
      };
    });
  }
  async diff(id: number, relative: string, staged = false) {
    workspaceRelative(relative);
    return this.access(id, async (f, run) => {
      // Validate ancestors even for a tracked deletion; never follow a symlink.
      const target = await f.target(relative, true);
      const stat = await fs.lstat(target).catch((e) => {
        if (e.code === 'ENOENT') return null;
        throw e;
      });
      if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1))
        workspaceFail('WORKSPACE_PATH_FORBIDDEN');
      const result = await run(
        [
          'diff',
          '--no-ext-diff',
          '--no-textconv',
          '--ignore-submodules=all',
          ...(staged ? ['--cached'] : []),
          '--',
          relative,
        ],
        false,
        false,
        256 * 1024,
      );
      const lines = result.stdout.split('\n'),
        limited = lines.slice(0, 4000).join('\n');
      const text =
        Buffer.byteLength(limited) > 256 * 1024
          ? Buffer.from(limited)
              .subarray(0, 256 * 1024 - 4)
              .toString('utf8')
          : limited;
      return {
        path: relative,
        staged,
        text,
        binary: /Binary files .* differ/.test(text),
        truncated:
          !!result.truncated || lines.length > 4000 || text !== limited,
      };
    });
  }
  @PlatformMutation()
  async stage(id: number, paths: string[], unstage = false) {
    if (!paths.length || paths.length > 200)
      workspaceFail('WORKSPACE_PATH_INVALID', 400);
    paths.forEach((p) => workspaceRelative(p));
    return this.access(id, async (f, run) => {
      for (const p of paths) {
        const target = await f.target(p, true),
          stat = await fs.lstat(target).catch((e) => {
            if (e.code === 'ENOENT') return null;
            throw e;
          });
        if (
          stat &&
          (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
        )
          workspaceFail('WORKSPACE_PATH_FORBIDDEN');
      }
      if (!unstage) await run(['add', '-A', '--', ...paths]);
      else {
        const head = await run(['rev-parse', '--verify', 'HEAD'], false, true);
        await run(
          head.code
            ? ['rm', '--cached', '-f', '--ignore-unmatch', '--', ...paths]
            : ['restore', '--staged', '--', ...paths],
        );
      }
      return { ok: true };
    });
  }
  @PlatformMutation()
  async commit(id: number, message: string) {
    if (
      typeof message !== 'string' ||
      !message.trim() ||
      Buffer.byteLength(message) > 8192 ||
      message.includes('\0')
    )
      workspaceFail('GIT_COMMIT_MESSAGE_INVALID', 400);
    const identity = await this.identity();
    if (!identity) workspaceFail('GIT_IDENTITY_REQUIRED');
    return this.access(id, async (_f, run) => {
      const status = parsePorcelain(
        (
          await run([
            'status',
            '--porcelain=v1',
            '-z',
            '--untracked-files=no',
            '--ignore-submodules=all',
          ])
        ).stdout,
      );
      if (status.conflicted) workspaceFail('GIT_CONFLICT');
      if (!status.staged) workspaceFail('GIT_NOTHING_TO_COMMIT');
      await run([
        '-c',
        `user.name=${identity.name}`,
        '-c',
        `user.email=${identity.email}`,
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--no-gpg-sign',
        '--no-verify',
        '-m',
        message,
      ]);
      return {
        sha: (await run(['rev-parse', 'HEAD'])).stdout.trim(),
        summary: message.trim().split('\n')[0].slice(0, 200),
      };
    });
  }
  @PlatformMutation()
  async push(id: number, branch?: string) {
    return this.access(id, async (_f, run, _row, repo) => {
      const current = await run(
        ['symbolic-ref', '--quiet', '--short', 'HEAD'],
        false,
        true,
      );
      if (current.code) workspaceFail('DETACHED_HEAD');
      const local = current.stdout.trim();
      const remote = await run(
        ['config', '--get', `branch.${local}.remote`],
        false,
        true,
      );
      const merge = await run(
        ['config', '--get', `branch.${local}.merge`],
        false,
        true,
      );
      if (!merge.code && !merge.stdout.trim().startsWith('refs/heads/'))
        workspaceFail('GIT_UPSTREAM_REQUIRED');
      let target = merge.code
        ? branch
        : merge.stdout.trim().replace(/^refs\/heads\//, '');
      if (!target || (!remote.code && remote.stdout.trim() !== 'origin'))
        workspaceFail('GIT_UPSTREAM_REQUIRED');
      this.worktrees.validateRef('branch', target);
      if (
        target.startsWith('-') ||
        (await run(['check-ref-format', '--branch', target], false, true)).code
      )
        workspaceFail('INVALID_REF');
      // No arbitrary destination URL or remote: the verified Repository origin is authoritative.
      const origin = (
        await run(['remote', 'get-url', '--push', 'origin'])
      ).stdout.trim();
      if (origin !== repo.remote_url) workspaceFail('PATH_CONFLICT');
      const result = await run(
        [
          'push',
          '--porcelain',
          ...(merge.code ? ['--set-upstream'] : []),
          'origin',
          `HEAD:refs/heads/${target}`,
        ],
        true,
        true,
      );
      if (result.code)
        workspaceFail(
          /non-fast-forward|fetch first|\[rejected\]/i.test(
            result.stdout + '\n' + result.stderr,
          )
            ? 'GIT_PUSH_NON_FAST_FORWARD'
            : /authentication failed|permission denied|could not read username/i.test(
                result.stderr,
              )
            ? 'GIT_AUTH_FAILED'
            : 'GIT_REMOTE_UNREACHABLE',
        );
      return {
        remote: 'origin',
        branch: target,
        sha: (await run(['rev-parse', 'HEAD'])).stdout.trim(),
      };
    });
  }
}
