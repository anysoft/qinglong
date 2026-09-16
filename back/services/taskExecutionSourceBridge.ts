import fs from 'fs/promises';
import path from 'path';
import { TaskModel, TaskSourceModel } from '../data/task';
import { SubscriptionModel } from '../data/subscription';
import { SchedulerProjectionModel } from '../data/cron';
import config from '../config';
import { Transaction } from 'sequelize';
import {
  TaskDefinitionError,
  relativeTaskPath,
  validateTaskSourceFiles,
} from '../shared/taskDefinition';

const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
/** B01/B15: the only translation from canonical Task Source to existing scripts
 * publication. No Worktree direct execution and no managed Runtime activation. */
export default class TaskExecutionSourceBridge {
  async source(id: number, transaction?: Transaction) {
    const task = await TaskModel.findByPk(id, { transaction }),
      source = await TaskSourceModel.findByPk(id, { transaction });
    if (!task) throw new TaskDefinitionError('TASK_NOT_FOUND', 404);
    if (!source) throw new TaskDefinitionError('TASK_SOURCE_REQUIRED', 409);
    // The current shell bridge has positional mode arguments and a cron-text
    // transport. Do not reinterpret structured argv through that protocol.
    if (task.arguments.length)
      throw new TaskDefinitionError(
        'CURRENT_BRIDGE_ARGUMENTS_REQUIRE_PHASE_10',
        409,
      );
    const subscription = task.subscription_id
      ? await SubscriptionModel.findByPk(task.subscription_id, { transaction })
      : await SubscriptionModel.findOne({
          where: { worktree_id: source.worktree_id },
          order: [['id', 'ASC']],
          transaction,
        });
    if (!subscription || subscription.worktree_id !== source.worktree_id)
      throw new TaskDefinitionError('CURRENT_BRIDGE_SOURCE_NOT_PUBLISHED', 409);
    const prefix = `subscription-${subscription.id}`,
      root = path.join(config.scriptPath, prefix);
    await validateTaskSourceFiles(root, source).catch(() => {
      throw new TaskDefinitionError('CURRENT_BRIDGE_SOURCE_NOT_PUBLISHED', 409);
    });
    return { task, source, prefix, root };
  }
  async refresh(id: number, transaction?: Transaction) {
    const task = await TaskModel.findByPk(id, { transaction });
    if (!task) throw new TaskDefinitionError('TASK_NOT_FOUND', 404);
    let data: Awaited<ReturnType<TaskExecutionSourceBridge['source']>>;
    try {
      data = await this.source(id, transaction);
    } catch (error) {
      // Keep historical log/status identity and the command-only migration audit.
      await SchedulerProjectionModel.update(
        { isDisabled: 1 },
        { where: { id }, transaction },
      );
      return {
        available: false,
        reason: (error as TaskDefinitionError).error_code,
      };
    }
    const source = data.source;
    const entry = `${data.prefix}/${relativeTaskPath(
      source.relative_entrypoint,
    )}`;
    const command = 'task ' + (/^[A-Za-z0-9_./-]+$/.test(entry) ? entry : quote(entry));
    const work_dir =
      source.cwd_mode === 'WORKTREE_ROOT'
        ? data.prefix
        : source.cwd_mode === 'CUSTOM_RELATIVE'
        ? `${data.prefix}/${relativeTaskPath(source.cwd_relative_path)}`
        : undefined;
    const values = {
      id,
      name: task.name,
      command,
      schedule: task.schedule ?? undefined,
      isDisabled: task.enabled && task.schedule ? (0 as const) : (1 as const),
      sub_id: task.subscription_id ?? undefined,
      discovery_key: task.discovery_key ?? undefined,
      source_relative_path: source.relative_entrypoint,
      discovery_definition: task.discovery_definition
        ? {
            ...task.discovery_definition,
            command,
          }
        : undefined,
      env_profile_id: task.env_profile_id,
      work_dir,
    };
    const existing = await SchedulerProjectionModel.findByPk(id, {
      transaction,
    });
    if (existing) await existing.update(values, { transaction });
    else
      await SchedulerProjectionModel.create(
        {
          ...values,
          status: 1,
          saved: false,
          log_name: `task-${id}`,
          log_path: '',
          labels: [],
        },
        { transaction },
      );
    return { available: true, reason: null };
  }
}
