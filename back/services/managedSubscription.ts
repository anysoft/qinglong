import { Service, Container } from 'typedi';
import fs from 'fs/promises';
import path from 'path';
import config from '../config';
import { Subscription, SubscriptionModel } from '../data/subscription';
import SubscriptionGitResolver, { legacyCheckoutName } from './subscriptionGit';
import RepositoryStorageService, { exists } from './repositoryStorage';
import WorktreeService from './worktree';
import { WorkspaceError } from '../shared/workspaceError';
import { WorkspaceGuard } from './workspaceLocks';
import CronService from './cron';

@Service()
export default class ManagedSubscriptionService {
  constructor(
    private storage: RepositoryStorageService,
    private worktrees: WorktreeService,
    private resolver: SubscriptionGitResolver,
  ) {}

  async exclusive<T>(id: number, action: () => Promise<T>) {
    return this.storage.locks.with(
      [{ kind: 'subscription', id }],
      'SUBSCRIPTION_SYNC',
      action,
    );
  }

  async prepare(sub: Subscription, phase?: (name: string) => Promise<void>) {
    if (sub.type === 'file' || !sub.repository_id)
      throw new WorkspaceError('MANAGED_REPOSITORY_REQUIRED');
    if (sub.proxy)
      throw new WorkspaceError(
        'MANAGED_PROXY_UNSUPPORTED',
        '订阅 proxy 仅用于 Legacy；Managed 使用 Git 网络配置',
      );
    const resolved = await this.resolver.resolveSubscriptionGitContext(sub);
    if (!resolved.repository)
      throw new WorkspaceError('MANAGED_REPOSITORY_REQUIRED');
    if (sub.branch) this.worktrees.validateRef('branch', sub.branch);
    const credentialId = resolved.credential?.id || null;
    const repo = await this.storage.get(sub.repository_id);
    if (repo.storage_state !== 'READY')
      await this.storage.initialize(repo.id!, credentialId);
    await this.storage.fetch(repo.id!, credentialId);
    const branch =
      sub.branch || (await this.storage.get(repo.id!)).default_branch;
    if (!branch) throw new WorkspaceError('MANAGED_BRANCH_REQUIRED');
    await phase?.('WORKTREE_ENSURE');
    const tree = await this.worktrees.ensure({
      repository_id: repo.id!,
      name: `Subscription ${sub.id || sub.name || ''}`,
      ref_type: 'branch',
      ref_name: branch,
      purpose: 'SUBSCRIPTION',
    });
    if ('lease' in tree && (tree.lease as any)?.busy) throw new WorkspaceError('WORKTREE_BUSY');
    this.worktrees.clean(tree);
    this.worktrees.safeLocalCommits(tree, tree);
    return { tree, branch, resolved };
  }

  async withBinding<T>(
    sub: Subscription,
    save: (worktreeId: number) => Promise<T>,
  ) {
    const { tree } = await this.prepare(sub);
    return this.worktrees.locked(
      tree.id!,
      'SUBSCRIPTION_BIND',
      async (guard, repo, row, bare) => {
        const status = await this.worktrees.snapshot(guard, repo, row, bare);
        this.worktrees.clean(status);
        this.worktrees.safeLocalCommits(status, row);
        return save(row.id!);
      },
    );
  }

  async preflight(id: number) {
    return this.exclusive(id, async () => {
      const sub = await SubscriptionModel.findByPk(id);
      if (!sub) throw new WorkspaceError('SUBSCRIPTION_NOT_FOUND');
      const { tree, branch } = await this.prepare(sub.get({ plain: true }));
      return {
        worktree_id: tree.id,
        branch,
        local_path: tree.local_path,
        ready: true,
      };
    });
  }

  async mode(id: number, mode: 'LEGACY' | 'MANAGED') {
    return this.exclusive(id, async () => {
      const sub = await SubscriptionModel.findByPk(id);
      if (!sub) throw new WorkspaceError('SUBSCRIPTION_NOT_FOUND');
      if (mode === 'LEGACY') {
        await sub.update({ git_mode: mode }); // Retain binding and all Git objects.
      } else {
        await this.withBinding(sub.get({ plain: true }), (id) =>
          sub.update({ git_mode: mode, worktree_id: id }),
        );
      }
      return sub.get({ plain: true });
    });
  }

  async run(id: number) {
    return this.exclusive(id, async () => {
      const sub = await SubscriptionModel.findByPk(id);
      if (!sub || sub.git_mode !== 'MANAGED')
        throw new WorkspaceError('MANAGED_SUBSCRIPTION_REQUIRED');
      let phase = 'REPOSITORY_FETCH';
      const mark = async (next: string) => {
        phase = next;
        await sub.update({ last_sync_phase: phase });
        process.stdout.write(`[Managed] ${phase} subscription=${id}\n`);
      };
      await sub.update({ last_sync_state: 'RUNNING', last_sync_error: null });
      try {
        await mark(phase);
        const { tree, resolved } = await this.prepare(
          sub.get({ plain: true }),
          mark,
        );
        if (sub.worktree_id && sub.worktree_id !== tree.id)
          throw new WorkspaceError('WORKTREE_BINDING_CHANGED');
        await sub.update({ worktree_id: tree.id });
        await mark('WORKTREE_UPDATE');
        await this.worktrees.withSync(
          tree.id!,
          async ({ before, after, worktree, guard }) => {
            process.stdout.write(
              `[Managed] worktree=${tree.id} commit=${before} -> ${after}\n`,
            );
            await this.storage.locks.with(
              [{ kind: 'publication', id: 1 }],
              'SUBSCRIPTION_PUBLISH',
              async () => {
                await mark('DISCOVERY');
                await Container.get(CronService).publishSubscription(
                  async () => {
                    const plan = await this.stage(
                      sub.get({ plain: true }),
                      resolved.remoteUrl,
                      worktree.local_path!,
                      guard,
                    );
                    try {
                      const repo = await this.storage.get(
                        worktree.repository_id,
                      );
                      const snapshot = await this.worktrees.snapshot(
                        guard,
                        repo,
                        await this.worktrees.get(tree.id!),
                        await this.storage.location(repo),
                      );
                      this.worktrees.clean(snapshot);
                      if (snapshot.git?.head !== after)
                        throw new WorkspaceError(
                          'WORKTREE_CHANGED_DURING_DISCOVERY',
                        );
                      return plan;
                    } catch (error) {
                      await plan.cleanup();
                      throw error;
                    }
                  },
                  async () => mark('COPY_AND_CRON'),
                );
              },
            );
            await sub.update({
              last_synced_commit: after,
              last_sync_at: new Date(),
              last_sync_state: 'SUCCESS',
              last_sync_phase: 'COMPLETE',
              last_sync_error: null,
            });
          },
        );
        return 0;
      } catch (error: any) {
        const code = /^[A-Z_]+$/.test(error.error_code || '')
          ? error.error_code
          : 'MANAGED_SYNC_FAILED';
        await sub.update({
          last_sync_state: 'FAILED',
          last_sync_phase: phase,
          last_sync_error: code,
        });
        process.stderr.write(`[Managed] ${phase}: ${code}\n`);
        throw new WorkspaceError(code);
      }
    });
  }

  private async validateFiles(root: string) {
    await this.storage.paths.noSymlinks(root);
    const walk = async (dir: string) => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (
          entry.name.startsWith('-') ||
          !/^[A-Za-z0-9_.-]+$/.test(entry.name) ||
          (!entry.isFile() && !entry.isDirectory())
        )
          throw new WorkspaceError('UNSAFE_DISCOVERY_PATH');
        if (entry.isDirectory()) await walk(path.join(dir, entry.name));
      }
    };
    await walk(root);
  }

  private async stage(
    sub: Subscription,
    remote: string,
    source: string,
    guard: WorkspaceGuard,
  ) {
    await this.validateFiles(source);
    const prefix = legacyCheckoutName(remote, sub.branch);
    const root = await this.storage.paths.root();
    const scriptsRoot = path.join(root, 'scripts');
    const destination = path.join(scriptsRoot, prefix);
    for (const file of ['sendNotify.js', 'notify.py'])
      await this.storage.paths.assertSafe(path.join(scriptsRoot, file));
    await this.storage.paths.assertSafe(
      path.join(root, 'config', 'crontab.list'),
    );
    await this.storage.paths.assertSafe(destination);
    if (await exists(destination)) await this.validateFiles(destination);
    const deps = path.join(root, 'deps');
    if (await exists(deps)) await this.validateFiles(deps);
    // Stage on the same filesystem so publish and rollback use rename, never partial copy.
    await fs.mkdir(scriptsRoot, { recursive: true });
    const stage = await fs.mkdtemp(path.join(scriptsRoot, '.managed-'));
    const staged = path.join(stage, 'scripts', prefix),
      backup = path.join(stage, 'previous');
    let moved = false,
      published = false;
    try {
      await fs.mkdir(staged, { recursive: true });
      if (await exists(destination))
        await fs.cp(destination, staged, { recursive: true });
      await fs.copyFile(config.crontabFile, path.join(stage, 'crontab.list'));
      const result = await guard.run(
        [
          path.join(config.rootPath, 'shell/managed_discovery.sh'),
          source,
          stage,
          prefix,
          sub.whitelist || '',
          sub.blacklist || '',
          sub.dependences || '',
          sub.extensions || '',
          String(sub.autoAddCron == null ? true : Boolean(sub.autoAddCron)),
          String(sub.autoDelCron == null ? true : Boolean(sub.autoDelCron)),
        ],
        config.rootPath,
        {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          QL_DIR: config.rootPath,
          QL_DATA_DIR: config.dataPath,
          SUB_ID: String(sub.id),
          LANG: 'C.UTF-8',
        },
        300000,
        'bash',
      );
      if (result.code || !(await exists(path.join(stage, 'complete'))))
        throw new WorkspaceError('DISCOVERY_FAILED');
      const lines = async (name: string) =>
        (await fs.readFile(path.join(stage, name), 'utf8'))
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      const adds = await lines('add.jsonl'),
        drops = (await lines('drop.jsonl')).flat().map(Number);
      if (
        drops.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
        adds.some(
          (x) =>
            x.sub_id !== sub.id || !x.command.startsWith(`task ${prefix}/`),
        )
      )
        throw new WorkspaceError('INVALID_DISCOVERY_PLAN');
      await this.validateFiles(staged);
      process.stdout.write(
        `[Managed] discovery add=${adds.length} drop=${drops.length}\n`,
      );
      const notifications = await lines('notifications.jsonl');
      return {
        adds,
        drops,
        commandPrefix: `task ${prefix}/`,
        checkpoint: async (tasks: unknown[]) => {
          await fs.writeFile(path.join(stage, 'recovery.json'), JSON.stringify({ subscription_id: sub.id, destination, backup, tasks }, null, 2), { mode: 0o600 });
        },
        notify: async () => {
          if (!notifications.length) return;
          const { default: NotificationService } = await import('./notify');
          for (const item of notifications)
            await Container.get(NotificationService).notify(
              item.title,
              item.content,
            );
        },
        publish: async () => {
          await this.storage.paths.assertSafe(destination);
          await fs.mkdir(path.dirname(destination), { recursive: true });
          if (await exists(destination)) {
            await fs.rename(destination, backup);
            moved = true;
          }
          await fs.rename(staged, destination);
          published = true;
        },
        rollback: async () => {
          if (published) await fs.rm(destination, { recursive: true });
          if (moved) await fs.rename(backup, destination);
        },
        cleanup: async () => {
          await fs.rm(stage, { recursive: true, force: true });
        },
      };
    } catch (error) {
      await fs.rm(stage, { recursive: true, force: true });
      throw error;
    }
  }
}
