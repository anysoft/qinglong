import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { CrontabModel } from '../data/cron';
import {
  TaskHook,
  TaskHookModel,
  HookPhase,
  FailurePolicy,
} from '../data/configAsset';
import { ConfigAssetError, configId } from '../shared/configAssets';
export const HOOK_PHASES: HookPhase[] = [
  'BEFORE',
  'AFTER_SUCCESS',
  'AFTER_FAILURE',
  'FINALLY',
];
export const defaultHookPolicy = (phase: HookPhase): FailurePolicy =>
  phase === 'AFTER_FAILURE' ? 'CONTINUE' : 'FAIL_EXECUTION';
@Service()
export default class TaskHookService {
  async list(taskId: number, transaction?: Transaction) {
    if (!(await CrontabModel.findByPk(configId(taskId), { transaction })))
      throw new ConfigAssetError('TASK_NOT_FOUND', 404);
    return TaskHookModel.findAll({
      where: { task_id: taskId },
      order: [
        ['phase', 'ASC'],
        ['position', 'ASC'],
        ['id', 'ASC'],
      ],
      transaction,
    });
  }
  async save(
    taskId: number,
    input: Partial<TaskHook> & { expected_version?: number },
  ) {
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 255 ||
      typeof input.command !== 'string' ||
      !input.command.trim() ||
      input.command.includes('\0') ||
      Buffer.byteLength(input.command) > 64 * 1024 ||
      !HOOK_PHASES.includes(input.phase!) ||
      !['TASK_CWD', 'WORKSPACE_ROOT'].includes(input.cwd_base!) ||
      !Number.isSafeInteger(input.position) ||
      input.position! < 0 ||
      !Number.isSafeInteger(input.timeout_seconds) ||
      input.timeout_seconds! < 1 ||
      input.timeout_seconds! > 3600 ||
      !['FAIL_EXECUTION', 'CONTINUE'].includes(input.failure_policy!) ||
      typeof input.enabled !== 'boolean'
    )
      throw new ConfigAssetError('TASK_HOOK_INVALID');
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        await this.list(taskId, transaction);
        const row = input.id
          ? await TaskHookModel.findOne({
              where: { id: configId(input.id), task_id: taskId },
              transaction,
            })
          : null;
        if (input.id && !row)
          throw new ConfigAssetError('TASK_HOOK_NOT_FOUND', 404);
        if (row && row.getDataValue('version') !== input.expected_version)
          throw new ConfigAssetError('HOOK_EDIT_CONFLICT', 409);
        const values = {
          task_id: taskId,
          name: input.name!.trim(),
          command: input.command!,
          phase: input.phase!,
          cwd_base: input.cwd_base!,
          position: input.position!,
          timeout_seconds: input.timeout_seconds!,
          failure_policy: input.failure_policy!,
          enabled: input.enabled!,
          version: (row?.getDataValue('version') ?? 0) + 1,
        };
        return (
          row
            ? await row.update(values, { transaction })
            : await TaskHookModel.create(values, { transaction })
        ).get({ plain: true });
      },
    );
  }
  async remove(taskId: number, id: number, version: number) {
    if (
      !(await TaskHookModel.destroy({
        where: { id: configId(id), task_id: configId(taskId), version },
      }))
    )
      throw new ConfigAssetError('HOOK_EDIT_CONFLICT', 409);
  }
  async reorder(
    taskId: number,
    changes: { id: number; position: number; version: number }[],
  ) {
    if (
      !Array.isArray(changes) ||
      changes.length > 100 ||
      new Set(changes.map((x) => x.id)).size !== changes.length ||
      changes.some((x) => !Number.isSafeInteger(x.position) || x.position < 0)
    )
      throw new ConfigAssetError('HOOK_ORDER_INVALID');
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const rows = await this.list(taskId, transaction);
        for (const change of changes) {
          const row = rows.find((x) => x.getDataValue('id') === change.id);
          if (!row || row.getDataValue('version') !== change.version)
            throw new ConfigAssetError('HOOK_EDIT_CONFLICT', 409);
          await row.update(
            { position: -row.getDataValue('id') },
            { transaction },
          );
        }
        for (const change of changes)
          await TaskHookModel.update(
            { position: change.position, version: change.version + 1 },
            { where: { id: change.id, task_id: taskId }, transaction },
          );
        return this.list(taskId, transaction);
      },
    );
  }
}
