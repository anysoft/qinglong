import { TaskSourceModel } from '../data/task';
import { TaskTriggerModel, GitUpdateTriggerModel } from '../data/taskTrigger';
import { Repository } from '../data/repository';
import { WorkspaceGuard } from './workspaceLocks';
import GitCommandService from './gitCommand';
import TriggerEvents from './triggerEvents';
import {
  matchesGlob,
  secretDigest,
  TriggerError,
} from '../shared/triggerDefinition';

export default class GitUpdateTriggerService {
  constructor(readonly events = new TriggerEvents()) {}
  async evaluate(
    input: {
      repository: Repository;
      worktree_id: number;
      root: string;
      before: string | null;
      after: string;
    },
    guard: WorkspaceGuard,
    commands: GitCommandService,
  ) {
    if (input.before === input.after) return;
    if (
      !/^[0-9a-f]{40,64}$/.test(input.after) ||
      (input.before && !/^[0-9a-f]{40,64}$/.test(input.before))
    )
      throw new TriggerError('GIT_TRIGGER_COMMIT_INVALID');
    const sources = await TaskSourceModel.findAll({
      where: { worktree_id: input.worktree_id },
    });
    const triggers = await TaskTriggerModel.findAll({
      where: { task_id: sources.map((s) => s.task_id), type: 'GIT_UPDATE' },
    });
    const configs = await GitUpdateTriggerModel.findAll({
      where: { trigger_id: triggers.map((t) => t.id) },
    });
    const configById = new Map(configs.map((c) => [c.trigger_id, c]));
    const sourceByTask = new Map(
      sources.map((s) => [s.task_id, s.relative_entrypoint]),
    );
    let changed: string[] = [],
      diffFailed = false;
    if (input.before && configs.some((c) => c.mode !== 'ANY_CHANGE')) {
      try {
        const result = await commands.run(
          guard,
          input.repository,
          [
            'diff',
            '--no-ext-diff',
            '--no-textconv',
            '--name-only',
            '-z',
            input.before,
            input.after,
            '--',
          ],
          input.root,
        );
        changed = result.stdout.split('\0').filter(Boolean);
      } catch {
        diffFailed = true;
      }
    }
    for (const trigger of triggers) {
      const config = configById.get(trigger.id);
      if (!config) continue;
      const metadata = {
        repository_id: input.repository.id,
        worktree_id: input.worktree_id,
        before: input.before,
        after: input.after,
        initial: !input.before,
      };
      const eventKey = 'git:' + secretDigest(JSON.stringify(metadata));
      let skip: string | undefined;
      if (!input.before && !config.fire_on_initial)
        skip = 'GIT_INITIAL_SYNC_SKIPPED';
      else if (!trigger.enabled) skip = 'TRIGGER_DISABLED';
      else if (input.before && config.mode !== 'ANY_CHANGE' && diffFailed)
        skip = 'GIT_DIFF_FAILED';
      else if (
        input.before &&
        config.mode === 'SOURCE_CHANGE' &&
        !changed.includes(sourceByTask.get(trigger.task_id)!)
      )
        skip = 'GIT_SOURCE_UNCHANGED';
      else if (
        input.before &&
        config.mode === 'PATH_FILTER' &&
        !changed.some((file) =>
          config.path_filters.some((p) => matchesGlob(p, file)),
        )
      )
        skip = 'GIT_PATH_UNMATCHED';
      const event = await this.events.receive(
        trigger.id,
        eventKey,
        metadata,
        skip,
      );
      if (skip === 'GIT_DIFF_FAILED') await event.update({ status: 'FAILED' });
      else if (!skip) await this.events.dispatch(event.id);
    }
  }
}
