import fs from 'fs/promises';
import path from 'path';
import { TaskModel, TaskSourceModel } from '../data/task';
import { SubscriptionModel } from '../data/subscription';
import { SchedulerProjectionModel } from '../data/cron';
import config from '../config';
import { executionLauncher } from '../shared/executionLauncher';
import { Transaction } from 'sequelize';
import {
  TaskDefinitionError,
  relativeTaskPath,
  validateTaskSourceFiles,
} from '../shared/taskDefinition';

const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
/** Scheduler projection writes only a protected Task-ID launcher.
 * source() remains solely for the disabled B17 recovery bridge. */
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
    const source = await TaskSourceModel.findByPk(id, { transaction });
    if (!source) {
      await SchedulerProjectionModel.update(
        { isDisabled: 1 },
        { where: { id }, transaction },
      );
      return { available: false, reason: 'TASK_SOURCE_REQUIRED' };
    }
    const command = executionLauncher(id);
    const values = {
      id,
      name: task.name,
      command,
      schedule: undefined,
      isDisabled: 1 as const,
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
      work_dir: undefined,
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
