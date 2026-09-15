import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { RepositoryModel } from '../data/repository';
import { CrontabModel } from '../data/cron';
import { SubscriptionModel } from '../data/subscription';
import {
  ConfigAssetModel,
  ConfigAssetRevisionModel,
  RepositoryConfigBindingModel,
  TaskConfigBindingModel,
  ConfigBinding,
  ConfigRevision,
} from '../data/configAsset';
import { ConfigAssetError, configId, targetPath } from '../shared/configAssets';
export interface ResolvedConfig {
  asset_id: number;
  revision_id: number;
  revision: ConfigRevision;
  is_secret: boolean;
  asset_name: string;
  binding: ConfigBinding;
  source: 'REPOSITORY' | 'TASK';
}
@Service()
export default class TaskConfigService {
  private model(scope: 'repository' | 'task') {
    return scope === 'repository'
      ? RepositoryConfigBindingModel
      : TaskConfigBindingModel;
  }
  private ownerKey(scope: 'repository' | 'task') {
    return scope === 'repository' ? 'repository_id' : 'task_id';
  }
  async list(
    scope: 'repository' | 'task',
    ownerId: number,
    transaction?: Transaction,
  ) {
    const owner =
      scope === 'repository'
        ? await RepositoryModel.findByPk(configId(ownerId), { transaction })
        : await CrontabModel.findByPk(configId(ownerId), { transaction });
    if (!owner) throw new ConfigAssetError('CONFIG_OWNER_NOT_FOUND', 404);
    return this.model(scope).findAll({
      where: { [this.ownerKey(scope)]: ownerId },
      order: [
        ['target_base', 'ASC'],
        ['target_path', 'ASC'],
      ],
      transaction,
    });
  }
  async save(
    scope: 'repository' | 'task',
    ownerId: number,
    input: Partial<ConfigBinding> & { expected_version?: number },
  ) {
    const normalized = targetPath(input.target_path);
    if (
      !['WORKSPACE_ROOT', 'TASK_DIR'].includes(input.target_base!) ||
      !['COPY', 'SYMLINK'].includes(input.materialization_mode!) ||
      !['FAIL_IF_EXISTS', 'REPLACE_RESTORE'].includes(input.conflict_policy!) ||
      !['ATTACH', 'MASK'].includes(input.operation!) ||
      (scope === 'repository' && input.operation === 'MASK') ||
      typeof input.writable !== 'boolean' ||
      typeof input.enabled !== 'boolean'
    )
      throw new ConfigAssetError('CONFIG_BINDING_INVALID');
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        await this.list(scope, ownerId, transaction);
        if (
          scope === 'repository' &&
          (await RepositoryModel.findByPk(ownerId, { transaction }))
            ?.storage_state === 'DELETING'
        )
          throw new ConfigAssetError('CONFIG_OWNER_DELETING', 409);
        if (
          input.operation === 'ATTACH' &&
          !(await ConfigAssetModel.findByPk(configId(input.asset_id), {
            transaction,
          }))
        )
          throw new ConfigAssetError('CONFIG_ASSET_NOT_FOUND', 404);
        const model = this.model(scope),
          key = this.ownerKey(scope);
        const row = input.id
          ? await model.findOne({
              where: { id: configId(input.id), [key]: ownerId },
              transaction,
            })
          : null;
        if (input.id && !row)
          throw new ConfigAssetError('CONFIG_BINDING_NOT_FOUND', 404);
        if (row && row.getDataValue('version') !== input.expected_version)
          throw new ConfigAssetError('CONFIG_EDIT_CONFLICT', 409);
        const values = {
          [key]: ownerId,
          asset_id: input.operation === 'MASK' ? null : input.asset_id,
          operation: input.operation,
          target_base: input.target_base,
          target_path: normalized,
          materialization_mode: input.materialization_mode,
          conflict_policy: input.conflict_policy,
          writable: input.writable,
          enabled: input.enabled,
          version: (row?.getDataValue('version') ?? 0) + 1,
        };
        return (
          row
            ? await row.update(values, { transaction })
            : await model.create(values, { transaction })
        ).get({ plain: true });
      },
    );
  }
  async remove(
    scope: 'repository' | 'task',
    ownerId: number,
    id: number,
    version: number,
  ) {
    const count = await this.model(scope).destroy({
      where: {
        id: configId(id),
        [this.ownerKey(scope)]: configId(ownerId),
        version,
      },
    });
    if (!count) throw new ConfigAssetError('CONFIG_EDIT_CONFLICT', 409);
  }
  async resolve(
    taskId: number | null,
    transaction: Transaction,
  ): Promise<ResolvedConfig[]> {
    if (!taskId) return [];
    const task = await CrontabModel.findByPk(taskId, { transaction });
    if (!task) throw new ConfigAssetError('TASK_NOT_FOUND', 404);
    const sub = task.sub_id
      ? await SubscriptionModel.findByPk(task.sub_id, { transaction })
      : null;
    const repository = sub?.repository_id
      ? await this.list('repository', sub.repository_id, transaction)
      : [];
    const taskRows = await this.list('task', taskId, transaction);
    const effective = new Map<
      string,
      { binding: ConfigBinding; source: 'REPOSITORY' | 'TASK' }
    >();
    for (const [rows, source] of [
      [repository, 'REPOSITORY'],
      [taskRows, 'TASK'],
    ] as const)
      for (const row of rows) {
        const binding = row.get({ plain: true });
        if (!binding.enabled) continue;
        const key = binding.target_base + ':' + targetPath(binding.target_path);
        if (binding.operation === 'MASK') effective.delete(key);
        else effective.set(key, { binding, source });
      }
    return Promise.all(
      [...effective.values()].map(async (entry) => {
        const asset = await ConfigAssetModel.findByPk(entry.binding.asset_id!, {
          transaction,
        });
        const revision = asset?.getDataValue('current_revision_id')
          ? await ConfigAssetRevisionModel.findByPk(
              asset.getDataValue('current_revision_id')!,
              { transaction },
            )
          : null;
        if (
          !asset ||
          !revision ||
          revision.getDataValue('asset_id') !== asset.getDataValue('id')
        )
          throw new ConfigAssetError('CONFIG_REVISION_NOT_FOUND');
        return {
          ...entry,
          asset_id: asset.getDataValue('id'),
          asset_name: asset.getDataValue('name'),
          is_secret: asset.getDataValue('is_secret'),
          revision_id: revision.getDataValue('id'),
          revision: revision.get({ plain: true }),
        };
      }),
    );
  }
  async preview(taskId: number) {
    return sequelize.transaction(async (transaction) =>
      (await this.resolve(configId(taskId), transaction)).map(
        ({ revision, ...entry }) => ({
          ...entry,
          revision: {
            id: revision.id,
            revision_number: revision.revision_number,
            size: revision.size,
            checksum: revision.checksum,
          },
        }),
      ),
    );
  }
}
