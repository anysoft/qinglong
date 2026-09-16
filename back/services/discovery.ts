import { triggerTimezone } from '../shared/triggerTimezone';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { SubscriptionModel } from '../data/subscription';
import { WorktreeModel } from '../data/worktree';
import {
  TaskModel,
  TaskSourceModel,
  TaskRuntimeBindingModel,
  TaskExecutionSettingsModel,
} from '../data/task';
import { DiscoveryPolicyModel } from '../data/discoveryPolicy';
import { TaskTriggerModel, CronTriggerModel } from '../data/taskTrigger';
import {
  TriggerError,
  exactKeys,
  positiveTriggerId,
  relativeGlob,
  cronNext,
} from '../shared/triggerDefinition';
import DiscoveryScanner, { DiscoveredFile } from './discoveryScanner';
import TaskResourceResolver from './taskResourceResolver';

const defaults = {
  enabled: true,
  includes: ['**/*'],
  excludes: [],
  languages: ['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'SHELL'],
  version: 0,
};
export default class DiscoveryService {
  async policy(subscriptionId: number, transaction?: Transaction) {
    if (
      !(await SubscriptionModel.findByPk(positiveTriggerId(subscriptionId), {
        transaction,
      }))
    )
      throw new TriggerError('SUBSCRIPTION_NOT_FOUND', 404);
    return (
      (
        await DiscoveryPolicyModel.findOne({
          where: { subscription_id: subscriptionId },
          transaction,
        })
      )?.get({ plain: true }) ?? {
        ...defaults,
        subscription_id: subscriptionId,
      }
    );
  }
  async savePolicy(subscriptionId: number, input: unknown) {
    exactKeys(input, [
      'enabled',
      'includes',
      'excludes',
      'languages',
      'expected_version',
    ]);
    if (
      typeof input.enabled !== 'boolean' ||
      !Array.isArray(input.includes) ||
      !input.includes.length ||
      !Array.isArray(input.excludes) ||
      input.includes.length + input.excludes.length > 128 ||
      !Array.isArray(input.languages) ||
      !input.languages.length ||
      input.languages.some((l: string) => !defaults.languages.includes(l))
    )
      throw new TriggerError('DISCOVERY_POLICY_INVALID');
    const values = {
      enabled: input.enabled,
      includes: input.includes.map(relativeGlob),
      excludes: input.excludes.map(relativeGlob),
      languages: [...new Set<string>(input.languages)],
    };
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const current = await this.policy(subscriptionId, transaction);
        if (input.expected_version !== current.version)
          throw new TriggerError('DISCOVERY_POLICY_VERSION_CONFLICT', 409);
        await DiscoveryPolicyModel.upsert(
          {
            ...values,
            subscription_id: subscriptionId,
            version: current.version + 1,
          },
          { transaction },
        );
        return this.policy(subscriptionId, transaction);
      },
    );
  }
  private async prepare(subscriptionId: number, transaction?: Transaction) {
    const sub = await SubscriptionModel.findByPk(subscriptionId, {
      transaction,
    });
    if (!sub?.worktree_id)
      throw new TriggerError('DISCOVERY_WORKTREE_REQUIRED');
    const tree = await WorktreeModel.findByPk(sub.worktree_id, { transaction });
    if (!tree?.local_path || tree.lifecycle_state !== 'READY')
      throw new TriggerError('DISCOVERY_WORKTREE_UNAVAILABLE');
    const policy = await this.policy(subscriptionId, transaction);
    const scan = await new DiscoveryScanner().scan(tree.local_path, policy);
    return { sub, tree, policy, ...scan };
  }
  private async plan(
    subscriptionId: number,
    files: DiscoveredFile[],
    enabled: boolean,
    transaction?: Transaction,
  ) {
    const tasks = await TaskModel.findAll({
      where: { subscription_id: subscriptionId },
      transaction,
    });
    const owned = new Map(tasks.map((t) => [t.discovery_key, t]));
    const selected = new Set(files.map((f) => f.key));
    const changes = files.map((file) => {
      const old = owned.get(file.key);
      const definition = { name: file.name, schedule: file.schedule ?? '' };
      return {
        action: !old
          ? 'CREATE'
          : JSON.stringify(old.discovery_definition) ===
            JSON.stringify(definition)
          ? 'UNCHANGED'
          : 'UPDATE',
        file,
        task_id: old?.id ?? null,
      };
    });
    if (enabled)
      for (const task of tasks)
        if (!selected.has(task.discovery_key!))
          changes.push({
            action: 'RETIRE',
            file: null as any,
            task_id: task.id,
          });
    return { tasks, changes };
  }
  async preview(subscriptionId: number) {
    const prepared = await this.prepare(positiveTriggerId(subscriptionId));
    const { changes } = await this.plan(
      subscriptionId,
      prepared.files,
      prepared.policy.enabled,
    );
    return {
      policy_version: prepared.policy.version,
      changes,
      diagnostics: prepared.diagnostics,
    };
  }
  async reconcile(subscriptionId: number) {
    const prepared = await this.prepare(positiveTriggerId(subscriptionId));
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const policy = await this.policy(subscriptionId, transaction);
        if (policy.version !== prepared.policy.version)
          throw new TriggerError('DISCOVERY_POLICY_VERSION_CONFLICT', 409);
        const { tasks, changes } = await this.plan(
          subscriptionId,
          prepared.files,
          policy.enabled,
          transaction,
        );
        const oldTasks = new Map(tasks.map((t) => [t.id, t]));
        const created = changes.filter((c) => c.action === 'CREATE');
        const newTasks = await TaskModel.bulkCreate(
          created.map((c) => ({
            name: c.file.name,
            origin: 'DISCOVERED' as const,
            subscription_id: subscriptionId,
            discovery_key: c.file.key,
            discovery_definition: {
              name: c.file.name,
              schedule: c.file.schedule ?? '',
            },
            enabled: false,
          })),
          { transaction, returning: true },
        );
        const byKey = new Map(newTasks.map((t) => [t.discovery_key, t]));
        await TaskSourceModel.bulkCreate(
          created.map((c) => ({
            task_id: byKey.get(c.file.key)!.id,
            worktree_id: prepared.tree.id!,
            relative_entrypoint: c.file.relative_path,
            language: c.file.language,
            cwd_mode: 'ENTRYPOINT_DIR' as const,
          })),
          { transaction },
        );
        await TaskRuntimeBindingModel.bulkCreate(
          created.map((c) => ({
            task_id: byKey.get(c.file.key)!.id,
            kind:
              c.file.language === 'SHELL'
                ? ('SHELL' as const)
                : c.file.language === 'PYTHON'
                ? ('PYTHON' as const)
                : ('NODE' as const),
          })),
          { transaction },
        );
        await TaskExecutionSettingsModel.bulkCreate(
          newTasks.map((t) => ({ task_id: t.id })),
          { transaction },
        );
        const previousSources = await TaskSourceModel.findAll({
          where: { task_id: tasks.map((t) => t.id) },
          transaction,
        });
        const rebound = previousSources.filter(
          (source) => source.worktree_id !== prepared.tree.id,
        );
        if (rebound.length) {
          await TaskSourceModel.bulkCreate(
            rebound.map((source) => ({
              ...source.get({ plain: true }),
              worktree_id: prepared.tree.id!,
            })),
            { transaction, updateOnDuplicate: ['worktree_id'] },
          );
          await TaskModel.increment(
            { version: 1 },
            {
              where: { id: rebound.map((source) => source.task_id) },
              transaction,
            },
          );
        }
        const allTasks = [...tasks, ...newTasks];
        const triggers = await TaskTriggerModel.findAll({
          where: { task_id: allTasks.map((t) => t.id) },
          transaction,
        });
        const cronOwners = new Map(
          triggers
            .filter((t) => t.discovery_key === 'source-cron')
            .map((t) => [t.task_id, t]),
        );
        const updates: any[] = [],
          triggerAdds: any[] = [],
          triggerUpdates: any[] = [],
          triggerDrops: number[] = [];
        const now = new Date();
        const timezone = await triggerTimezone(sequelize, transaction);
        for (const change of changes) {
          if (change.action === 'RETIRE') {
            const old = oldTasks.get(change.task_id!)!;
            if (old.enabled)
              updates.push({
                ...old.get({ plain: true }),
                enabled: false,
                version: old.version + 1,
              });
            const trigger = cronOwners.get(old.id);
            if (trigger?.origin === 'DISCOVERY') triggerDrops.push(trigger.id);
            continue;
          }
          const old = change.task_id
            ? oldTasks.get(change.task_id)!
            : byKey.get(change.file.key)!;
          if (change.action === 'UPDATE')
            updates.push({
              ...old.get({ plain: true }),
              name:
                !old.discovery_definition ||
                old.name === old.discovery_definition.name
                  ? change.file.name
                  : old.name,
              discovery_definition: {
                name: change.file.name,
                schedule: change.file.schedule ?? '',
              },
              version: old.version + 1,
            });
          const trigger = cronOwners.get(old.id);
          if (trigger?.origin === 'USER') continue;
          if (!change.file.schedule) {
            if (trigger) triggerDrops.push(trigger.id);
            continue;
          }
          if (!trigger)
            triggerAdds.push({
              task_id: old.id,
              type: 'CRON',
              origin: 'DISCOVERY',
              discovery_key: 'source-cron',
              enabled: true,
            });
          else if (change.action === 'UPDATE')
            triggerUpdates.push({
              trigger_id: trigger.id,
              expression: change.file.schedule,
              timezone,
              misfire_policy: 'SKIP',
              next_fire_at: cronNext(change.file.schedule, timezone, now),
            });
        }
        if (updates.length)
          await TaskModel.bulkCreate(updates, {
            transaction,
            updateOnDuplicate: [
              'name',
              'enabled',
              'discovery_definition',
              'version',
            ],
          });
        if (triggerDrops.length)
          await TaskTriggerModel.destroy({
            where: { id: triggerDrops },
            transaction,
          });
        if (triggerUpdates.length)
          await TaskTriggerModel.increment(
            { version: 1 },
            {
              where: { id: triggerUpdates.map((c) => c.trigger_id) },
              transaction,
            },
          );
        const inserted = await TaskTriggerModel.bulkCreate(triggerAdds, {
          transaction,
          returning: true,
        });
        const filesByTask = new Map(
          changes
            .filter((c) => c.file)
            .map((c) => [c.task_id ?? byKey.get(c.file.key)!.id, c.file]),
        );
        const configs = inserted.map((trigger) => ({
          trigger_id: trigger.id,
          expression: filesByTask.get(trigger.task_id)!.schedule!,
          timezone,
          misfire_policy: 'SKIP' as const,
          next_fire_at: cronNext(
            filesByTask.get(trigger.task_id)!.schedule!,
            timezone,
            now,
          ),
        }));
        if (configs.length || triggerUpdates.length)
          await CronTriggerModel.bulkCreate([...configs, ...triggerUpdates], {
            transaction,
            updateOnDuplicate: ['expression', 'next_fire_at'],
          });
        if (newTasks.length) {
          const resources = await new TaskResourceResolver().resolve(
            newTasks.map((t) => t.id),
            transaction,
          );
          await TaskModel.update(
            { enabled: true },
            {
              where: {
                id: resources
                  .filter((r) => r.readiness.status === 'READY')
                  .map((r) => r.task.id),
              },
              transaction,
            },
          );
        }
        const counts = Object.fromEntries(
          ['CREATE', 'UPDATE', 'RETIRE', 'UNCHANGED'].map((action) => [
            action,
            changes.filter((c) => c.action === action).length,
          ]),
        );
        await DiscoveryPolicyModel.upsert(
          {
            ...policy,
            subscription_id: subscriptionId,
            version: policy.version || 1,
            last_reconciled_at: now,
            last_result: {
              ...('last_result' in policy ? policy.last_result ?? {} : {}),
              counts,
              diagnostics: prepared.diagnostics,
            },
          },
          { transaction },
        );
        return { counts, diagnostics: prepared.diagnostics };
      },
    );
  }
}
