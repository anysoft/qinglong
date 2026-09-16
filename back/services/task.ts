import { cloneTaskTriggers } from './cloneTaskTriggers';
import { Service } from 'typedi';
import { Transaction, ModelStatic, Model } from 'sequelize';
import { sequelize } from '../data';
import {
  TaskModel,
  TaskSourceModel,
  TaskRuntimeBindingModel,
  TaskExecutionSettingsModel,
  RuntimeDefaultModel,
  Task,
  TaskSource,
  TaskRuntimeBinding,
  TaskExecutionSettings,
} from '../data/task';
import { TaskConfigBindingModel, TaskHookModel } from '../data/configAsset';
import { WorktreeModel } from '../data/worktree';
import { RepositoryModel } from '../data/repository';
import { SubscriptionModel } from '../data/subscription';
import { PythonEnvironmentModel } from '../data/pythonEnvironment';
import { NodeEnvironmentModel } from '../data/nodeEnvironment';
import TaskResourceResolver from './taskResourceResolver';
import {
  TaskDefinitionError,
  taskSource,
  taskRuntime,
  taskArguments,
  taskSettings,
  runtimeKind,
} from '../shared/taskDefinition';

export interface TaskDefinitionInput {
  name: string;
  description?: string;
  enabled?: boolean;
  env_profile_id?: number | null;
  arguments: string[];
  source: Omit<TaskSource, 'task_id'>;
  runtime?: Omit<TaskRuntimeBinding, 'task_id'>;
  settings?: Partial<Omit<TaskExecutionSettings, 'task_id'>>;
  expected_version?: number;
}
function allowedKeys(input: unknown, keys: string[]) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !keys.includes(key))
  )
    throw new TaskDefinitionError('TASK_UNKNOWN_FIELD');
}
function positiveId(input: unknown): number {
  if (!Number.isSafeInteger(input) || Number(input) < 1)
    throw new TaskDefinitionError('TASK_ID_INVALID');
  return Number(input);
}
/** Canonical definitions only. Scheduling and execution adapters consume committed
 * definitions; this service never spawns, stops or reads process logs. */
@Service()
export default class TaskService {
  readonly resources = new TaskResourceResolver();
  private definitionTransaction<T>(
    transaction: Transaction | undefined,
    action: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    return transaction
      ? action(transaction)
      : sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, action);
  }
  async get(id: number, transaction?: Transaction) {
    const row = await TaskModel.findByPk(positiveId(id), { transaction });
    if (!row) throw new TaskDefinitionError('TASK_NOT_FOUND', 404);
    return row;
  }
  async detail(id: number, existingTransaction?: Transaction) {
    const read = async (transaction: Transaction) => {
      const row = await this.get(id, transaction);
      const [source, runtime, settings, resources] = await Promise.all([
        TaskSourceModel.findByPk(id, { transaction }),
        TaskRuntimeBindingModel.findByPk(id, { transaction }),
        TaskExecutionSettingsModel.findByPk(id, { transaction }),
        this.resources.resolve([id], transaction),
      ]);
      return {
        ...row.get({ plain: true }),
        source: source?.get({ plain: true }) ?? null,
        runtime: runtime?.get({ plain: true }) ?? null,
        settings: settings?.get({ plain: true }) ?? null,
        resources: resources[0],
      };
    };
    return existingTransaction
      ? read(existingTransaction)
      : sequelize.transaction(read);
  }
  async list(page = 1, size = 100) {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > 1000
    )
      throw new TaskDefinitionError('TASK_PAGINATION_INVALID');
    return sequelize.transaction(async (transaction) => {
      const { rows, count } = await TaskModel.findAndCountAll({
        order: [['id', 'DESC']],
        offset: (page - 1) * size,
        limit: size,
        transaction,
      });
      const resources = new Map(
        (
          await this.resources.resolve(
            rows.map((t) => t.id),
            transaction,
          )
        ).map((r) => [r.task.id, r]),
      );
      return {
        data: rows.map((row) => ({
          ...row.get({ plain: true }),
          resources: resources.get(row.id),
        })),
        total: count,
      };
    });
  }
  private normalize(input: TaskDefinitionInput) {
    allowedKeys(input, [
      'name',
      'description',
      'enabled',
      'env_profile_id',
      'arguments',
      'source',
      'runtime',
      'settings',
      'expected_version',
    ]);
    allowedKeys(input.source, [
      'type',
      'worktree_id',
      'relative_entrypoint',
      'language',
      'cwd_mode',
      'cwd_relative_path',
    ]);
    if (input.runtime)
      allowedKeys(input.runtime, [
        'kind',
        'python_environment_id',
        'node_environment_id',
      ]);
    if (input.settings)
      allowedKeys(input.settings, [
        'timeout_seconds',
        'max_attempts',
        'initial_delay_seconds',
        'backoff',
        'concurrency',
        'notification',
      ]);
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 255 ||
      (input.description !== undefined &&
        (typeof input.description !== 'string' ||
          input.description.length > 8192)) ||
      (input.enabled !== undefined && typeof input.enabled !== 'boolean')
    )
      throw new TaskDefinitionError('TASK_DEFINITION_INVALID');
    if (input.env_profile_id != null) positiveId(input.env_profile_id);
    const source = taskSource(input.source),
      runtime = taskRuntime(
        input.runtime ?? { kind: runtimeKind(source.language) },
        source.language,
      );

    return {
      task: {
        name: input.name.trim(),
        description: input.description ?? '',
        enabled: input.enabled ?? false,
        env_profile_id: input.env_profile_id ?? null,
        arguments: taskArguments(input.arguments),
      },
      source,
      runtime,
      settings: taskSettings(input.settings ?? {}),
    };
  }
  async save(
    input: TaskDefinitionInput,
    id?: number,
    existingTransaction?: Transaction,
  ) {
    const normalized = this.normalize(input);
    const saved = await this.definitionTransaction(
      existingTransaction,
      async (transaction) => {
        const old = id ? await this.get(id, transaction) : null;
        if (old && old.version !== input.expected_version)
          throw new TaskDefinitionError('TASK_EDIT_CONFLICT', 409);
        const worktree = await WorktreeModel.findByPk(
          normalized.source.worktree_id,
          { transaction },
        );
        if (!worktree || worktree.lifecycle_state === 'DELETING')
          throw new TaskDefinitionError('TASK_WORKTREE_UNAVAILABLE', 409);
        const environmentId =
          normalized.runtime.python_environment_id ??
          normalized.runtime.node_environment_id;
        if (environmentId != null) {
          const environment =
            normalized.runtime.kind === 'PYTHON'
              ? await PythonEnvironmentModel.findByPk(environmentId, {
                  transaction,
                })
              : await NodeEnvironmentModel.findByPk(environmentId, {
                  transaction,
                });
          if (!environment || environment.getDataValue('state') === 'DELETING')
            throw new TaskDefinitionError('TASK_ENVIRONMENT_UNAVAILABLE', 409);
        }
        if (old?.origin === 'DISCOVERED') {
          const previous = await TaskSourceModel.findByPk(old.id, {
            transaction,
          });
          if (
            previous &&
            (previous.worktree_id !== normalized.source.worktree_id ||
              previous.relative_entrypoint !==
                normalized.source.relative_entrypoint)
          )
            throw new TaskDefinitionError('TASK_SOURCE_DISCOVERY_OWNED', 409);
        }
        const task = old
          ? await old.update(
              {
                ...normalized.task,
                env_profile_id:
                  input.env_profile_id === undefined
                    ? old.env_profile_id
                    : normalized.task.env_profile_id,
                version: old.version + 1,
              },
              { transaction },
            )
          : await TaskModel.create(
              {
                ...normalized.task,
                origin: 'MANUAL',
                subscription_id: null,
                discovery_key: null,
                discovery_definition: null,
                version: 1,
              },
              { transaction },
            );
        await TaskSourceModel.upsert(
          { ...normalized.source, task_id: task.id },
          { transaction },
        );
        await TaskRuntimeBindingModel.upsert(
          { ...normalized.runtime, task_id: task.id },
          { transaction },
        );
        await TaskExecutionSettingsModel.upsert(
          { ...normalized.settings, task_id: task.id },
          { transaction },
        );
        const graph = (
          await this.resources.resolve([task.id], transaction, true)
        )[0];
        if (
          graph.readiness.diagnostics.some(
            (d) => d.status === 'INVALID' || d.status === 'SOURCE_MISSING',
          )
        )
          throw new TaskDefinitionError(
            graph.readiness.diagnostics[0].code,
            409,
          );
        if (task.enabled && graph.readiness.status !== 'READY')
          throw new TaskDefinitionError('TASK_NOT_READY', 409);
        return task.id;
      },
    );
    return this.detail(saved, existingTransaction);
  }
  async setEnabled(
    id: number,
    enabled: boolean,
    expected_version: number,
    existingTransaction?: Transaction,
  ) {
    if (typeof enabled !== 'boolean')
      throw new TaskDefinitionError('TASK_DEFINITION_INVALID');
    await this.definitionTransaction(
      existingTransaction,
      async (transaction) => {
        const row = await this.get(id, transaction);
        if (row.version !== expected_version)
          throw new TaskDefinitionError('TASK_EDIT_CONFLICT', 409);
        if (
          enabled &&
          (await this.resources.resolve([id], transaction, true))[0].readiness
            .status !== 'READY'
        )
          throw new TaskDefinitionError('TASK_NOT_READY', 409);
        await row.update(
          { enabled, version: row.version + 1 },
          { transaction },
        );
      },
    );
    return this.detail(id, existingTransaction);
  }
  async remove(
    id: number,
    expected_version: number,
    existingTransaction?: Transaction,
  ) {
    await this.definitionTransaction(
      existingTransaction,
      async (transaction) => {
        const row = await this.get(id, transaction);
        if (row.version !== expected_version)
          throw new TaskDefinitionError('TASK_EDIT_CONFLICT', 409);
        await row.destroy({ transaction });
      },
    );
  }
  async clone(id: number, name: string, existingTransaction?: Transaction) {
    if (typeof name !== 'string' || !name.trim() || name.length > 255)
      throw new TaskDefinitionError('TASK_DEFINITION_INVALID');
    const created = await this.definitionTransaction(
      existingTransaction,
      async (transaction) => {
        const old = (await this.get(id, transaction)).get({
          plain: true,
        }) as Task & { createdAt?: Date; updatedAt?: Date };
        const { id: ignoredId, createdAt, updatedAt, ...definition } = old;
        const resolved = (await this.resources.resolve([id], transaction))[0];
        // Removing discovery ownership must not silently discard subscription defaults.
        const task = await TaskModel.create(
          {
            ...definition,
            env_profile_id:
              resolved.environment.selected_by === 'SUBSCRIPTION'
                ? resolved.environment.profile_id
                : definition.env_profile_id,
            name: name.trim(),
            origin: 'MANUAL',
            enabled: false,
            subscription_id: null,
            discovery_key: null,
            discovery_definition: null,
            version: 1,
          },
          { transaction },
        );
        for (const model of [
          TaskSourceModel,
          TaskRuntimeBindingModel,
          TaskExecutionSettingsModel,
          TaskConfigBindingModel,
          TaskHookModel,
        ] as ModelStatic<Model>[]) {
          const rows = await model.findAll({
            where: { task_id: id },
            transaction,
          });
          for (const row of rows) {
            const {
              id: ignored,
              createdAt,
              updatedAt,
              ...values
            } = row.get({ plain: true }) as any;
            await model.create(
              { ...values, task_id: task.id },
              { transaction },
            );
          }
        }
        if (
          resolved.runtime.selected_by === 'SUBSCRIPTION' &&
          resolved.runtime.environment_id
        ) {
          await TaskRuntimeBindingModel.update(
            {
              python_environment_id:
                resolved.runtime.kind === 'PYTHON'
                  ? resolved.runtime.environment_id
                  : null,
              node_environment_id:
                resolved.runtime.kind === 'NODE'
                  ? resolved.runtime.environment_id
                  : null,
            },
            { where: { task_id: task.id }, transaction },
          );
        }
        // Secret values are copied inside the database and never returned in a DTO.
        await sequelize.query(
          `INSERT INTO TaskEnvVariables (task_id,name,value,status,operation,is_secret,position,labels,createdAt,updatedAt) SELECT :newId,name,value,status,operation,is_secret,position,labels,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM TaskEnvVariables WHERE task_id=:oldId`,
          { replacements: { newId: task.id, oldId: id }, transaction },
        );
        const webhook_secrets = await cloneTaskTriggers(
          id,
          task.id,
          transaction,
        );
        return { id: task.id, webhook_secrets };
      },
    );
    return {
      ...(await this.detail(created.id, existingTransaction)),
      webhook_secrets: created.webhook_secrets,
    };
  }
  async saveRuntimeDefault(
    scope: 'repository' | 'subscription',
    id: number,
    kind: 'PYTHON' | 'NODE',
    environment_id: number | null,
    expected_version: number,
  ) {
    if (
      !['repository', 'subscription'].includes(scope) ||
      !['PYTHON', 'NODE'].includes(kind)
    )
      throw new TaskDefinitionError('RUNTIME_DEFAULT_INVALID');
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const owner =
          scope === 'repository'
            ? await RepositoryModel.findByPk(positiveId(id), { transaction })
            : await SubscriptionModel.findByPk(positiveId(id), { transaction });
        if (!owner)
          throw new TaskDefinitionError('RUNTIME_DEFAULT_OWNER_MISSING', 404);
        const key =
          scope === 'repository' ? 'repository_id' : 'subscription_id';
        const row = await RuntimeDefaultModel.findOne({
          where: { [key]: id, kind },
          transaction,
        });
        if ((row?.version ?? 0) !== expected_version)
          throw new TaskDefinitionError('RUNTIME_DEFAULT_EDIT_CONFLICT', 409);
        if (environment_id === null) {
          await row?.destroy({ transaction });
          return null;
        }
        const environment =
          kind === 'PYTHON'
            ? await PythonEnvironmentModel.findByPk(
                positiveId(environment_id),
                { transaction },
              )
            : await NodeEnvironmentModel.findByPk(positiveId(environment_id), {
                transaction,
              });
        if (!environment || environment.getDataValue('state') === 'DELETING')
          throw new TaskDefinitionError('TASK_ENVIRONMENT_UNAVAILABLE', 409);
        const values = {
          repository_id: scope === 'repository' ? id : null,
          subscription_id: scope === 'subscription' ? id : null,
          kind,
          python_environment_id: kind === 'PYTHON' ? environment_id : null,
          node_environment_id: kind === 'NODE' ? environment_id : null,
          version: expected_version + 1,
        };
        return (
          row
            ? await row.update(values, { transaction })
            : await RuntimeDefaultModel.create(values, { transaction })
        ).get({ plain: true });
      },
    );
  }
}
