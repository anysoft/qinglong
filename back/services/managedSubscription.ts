import { PlatformMutation } from './backup/platform';
import DiscoveryService from './discovery';
import GitUpdateTriggerService from './gitUpdateTrigger';
import { Service } from 'typedi';
import { Subscription, SubscriptionModel } from '../data/subscription';
import SubscriptionGitResolver from './subscriptionGit';
import RepositoryStorageService from './repositoryStorage';
import WorktreeService from './worktree';
import { WorkspaceError } from '../shared/workspaceError';

@Service()
export default class ManagedSubscriptionService {
  constructor(
    private storage: RepositoryStorageService,
    private worktrees: WorktreeService,
    private resolver: SubscriptionGitResolver,
  ) {}

  @PlatformMutation()
  async exclusive<T>(id: number, action: () => Promise<T>) {
    return this.storage.locks.with(
      [{ kind: 'subscription', id }],
      'SUBSCRIPTION_SYNC',
      action,
    );
  }

  async prepare(sub: Subscription, phase?: (name: string) => Promise<void>) {
    if (!sub.repository_id) throw new WorkspaceError('REPOSITORY_REQUIRED');
    const resolved = await this.resolver.resolveSubscriptionGitContext(sub);
    if (!resolved.repository) throw new WorkspaceError('REPOSITORY_REQUIRED');
    if (sub.branch) this.worktrees.validateRef('branch', sub.branch);
    const repo = await this.storage.get(sub.repository_id);
    if (repo.storage_state !== 'READY') await this.storage.initialize(repo.id!);
    await this.storage.fetch(repo.id!);
    const branch =
      sub.branch || (await this.storage.get(repo.id!)).default_branch;
    if (!branch) throw new WorkspaceError('SUBSCRIPTION_BRANCH_REQUIRED');
    await phase?.('WORKTREE_ENSURE');
    const tree = await this.worktrees.ensure({
      repository_id: repo.id!,
      name: `Subscription ${sub.id || sub.name || ''}`,
      ref_type: 'branch',
      ref_name: branch,
      purpose: 'SUBSCRIPTION',
    });
    if ('lease' in tree && (tree.lease as any)?.busy)
      throw new WorkspaceError('WORKTREE_BUSY');
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
      return this.withBinding(sub.get({ plain: true }), async (worktreeId) => {
        await sub.update({ worktree_id: worktreeId });
        const tree = await this.worktrees.get(worktreeId);
        return {
          worktree_id: worktreeId,
          branch: tree.ref_name,
          local_path: tree.local_path,
          ready: true,
        };
      });
    });
  }

  async run(id: number) {
    return this.exclusive(id, async () => {
      const sub = await SubscriptionModel.findByPk(id);
      if (!sub) throw new WorkspaceError('SUBSCRIPTION_NOT_FOUND');
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
            await mark('DISCOVERY');
            await new DiscoveryService().reconcile(id);
            await mark('GIT_UPDATE_TRIGGERS');
            await new GitUpdateTriggerService().evaluate(
              {
                repository: await this.storage.get(worktree.repository_id),
                worktree_id: worktree.id!,
                root: worktree.local_path!,
                before: sub.last_synced_commit ?? null,
                after,
              },
              guard,
              this.storage.commands,
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
          : 'SUBSCRIPTION_SYNC_FAILED';
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
}
