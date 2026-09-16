import { Transaction, Model, ModelStatic, Op, WhereOptions } from 'sequelize';
import { sequelize } from '../data';
import {
  Task,
  TaskSource,
  TaskExecutionSettings,
  TaskModel,
  TaskSourceModel,
  TaskRuntimeBindingModel,
  TaskExecutionSettingsModel,
  RuntimeDefaultModel,
  TaskReadiness,
} from '../data/task';
import { WorktreeModel } from '../data/worktree';
import { RepositoryModel } from '../data/repository';
import { SubscriptionModel } from '../data/subscription';
import { EnvironmentProfileModel } from '../data/scopedEnv';
import { RuntimeInstallationModel } from '../data/runtime';
import {
  ConfigAssetModel,
  ConfigAssetRevisionModel,
  RepositoryConfigBindingModel,
  TaskConfigBindingModel,
  TaskHookModel,
} from '../data/configAsset';
import {
  PythonEnvironmentModel,
  PythonEnvironmentBuildModel,
} from '../data/pythonEnvironment';
import {
  NodeEnvironmentModel,
  NodeEnvironmentBuildModel,
  NodePackageManagerToolchainModel,
} from '../data/nodeEnvironment';
import {
  TaskDefinitionError,
  taskSource,
  taskRuntime,
  taskSettings,
  validateTaskSourceFiles,
  runtimeKind,
} from '../shared/taskDefinition';
import { targetPath } from '../shared/configAssets';

export interface TaskDiagnostic {
  code: string;
  status: Exclude<TaskReadiness, 'READY'>;
  resource_id?: number;
}
export interface TaskResourceResolution {
  task: Pick<Task, 'id' | 'name' | 'enabled' | 'origin' | 'version'>;
  source:
    | (Omit<TaskSource, 'task_id'> & { repository_id: number | null })
    | null;
  runtime: {
    kind: string | null;
    environment_id: number | null;
    selected_by: string;
    execution_activation: string;
  };
  environment: {
    profile_id: number | null;
    name: string | null;
    selected_by: string;
  };
  config: Array<{
    binding_id: number;
    asset_id: number;
    name: string | null;
    is_secret: boolean;
    target_base: string;
    target_path: string;
    origin: string;
  }>;
  hooks: Array<{ id: number; phase: string }>;
  settings: Omit<TaskExecutionSettings, 'task_id'> | null;
  readiness: {
    status: TaskReadiness;
    diagnostics: TaskDiagnostic[];
    source_checked: boolean;
  };
}
/** Definition-time resource relationships only. No runtime paths, secrets, leases,
 * materialization, snapshots or process execution belong in this service. */
export default class TaskResourceResolver {
  async resolve(
    ids: number[],
    transaction?: Transaction,
    deep = false,
  ): Promise<TaskResourceResolution[]> {
    if (!transaction)
      return sequelize.transaction((t) => this.resolve(ids, t, deep));
    const read = async (
      model: ModelStatic<Model>,
      where: WhereOptions = {},
      attributes?: string[],
    ): Promise<any[]> =>
      (await model.findAll({ where, attributes, transaction })).map((row) =>
        row.get({ plain: true }),
      );
    const unique = (values: Array<number | null | undefined>) => [
      ...new Set(values.filter((n): n is number => typeof n === 'number')),
    ];
    const [tasks, sources, bindings, settings, taskConfigs, hooks] =
      await Promise.all([
        read(TaskModel, { id: ids }),
        read(TaskSourceModel, { task_id: ids }),
        read(TaskRuntimeBindingModel, { task_id: ids }),
        read(TaskExecutionSettingsModel, { task_id: ids }),
        read(TaskConfigBindingModel, { task_id: ids }),
        read(TaskHookModel, { task_id: ids }, [
          'id',
          'task_id',
          'phase',
          'enabled',
          'failure_policy',
          'cwd_base',
          'timeout_seconds',
        ]),
      ]);
    const [worktrees, subscriptions] = await Promise.all([
      read(WorktreeModel, { id: unique(sources.map((s) => s.worktree_id)) }),
      read(SubscriptionModel, {
        id: unique(tasks.map((t) => t.subscription_id)),
      }),
    ]);
    const repositoryIds = unique(worktrees.map((w) => w.repository_id));
    const [repositories, defaults, repositoryConfigs] = await Promise.all([
      read(RepositoryModel, { id: repositoryIds }),
      read(RuntimeDefaultModel, {
        [Op.or]: [
          { repository_id: repositoryIds },
          { subscription_id: subscriptions.map((s) => s.id) },
        ],
      }),
      read(RepositoryConfigBindingModel, { repository_id: repositoryIds }),
    ]);
    const [profiles, pythonEnvironments, nodeEnvironments, assets] =
      await Promise.all([
        read(EnvironmentProfileModel, {
          id: unique([
            ...tasks.map((t) => t.env_profile_id),
            ...subscriptions.map((s) => s.env_profile_id),
            ...repositories.map((r) => r.default_env_profile_id),
          ]),
        }),
        read(PythonEnvironmentModel, {
          id: unique(
            [...bindings, ...defaults].map((b) => b.python_environment_id),
          ),
        }),
        read(NodeEnvironmentModel, {
          id: unique(
            [...bindings, ...defaults].map((b) => b.node_environment_id),
          ),
        }),
        read(ConfigAssetModel, {
          id: unique(
            [...taskConfigs, ...repositoryConfigs].map((b) => b.asset_id),
          ),
        }),
      ]);
    const [pythonBuilds, nodeBuilds, configRevisions] = await Promise.all([
      read(
        PythonEnvironmentBuildModel,
        { id: unique(pythonEnvironments.map((e) => e.current_build_id)) },
        ['id', 'environment_id', 'runtime_id', 'state', 'health'],
      ),
      read(
        NodeEnvironmentBuildModel,
        { id: unique(nodeEnvironments.map((e) => e.current_build_id)) },
        ['id', 'environment_id', 'runtime_id', 'toolchain_id', 'state', 'health'],
      ),
      read(
        ConfigAssetRevisionModel,
        { id: unique(assets.map((asset) => asset.current_revision_id)) },
        ['id', 'asset_id'],
      ),
    ]);
    const [runtimes, toolchains] = await Promise.all([
      read(RuntimeInstallationModel, { id: unique([...pythonBuilds, ...nodeBuilds].map(build => build.runtime_id)) }, ['id', 'state']),
      read(NodePackageManagerToolchainModel, { id: unique(nodeBuilds.map(build => build.toolchain_id)) }, ['id', 'runtime_id', 'state']),
    ]);
    const by = (rows: any[], key = 'id') =>
      new Map<number, any>(rows.map((row) => [row[key], row]));
    const sourceMap = by(sources, 'task_id'),
      bindingMap = by(bindings, 'task_id'),
      settingMap = by(settings, 'task_id'),
      worktreeMap = by(worktrees),
      subscriptionMap = by(subscriptions),
      repositoryMap = by(repositories),
      profileMap = by(profiles),
      pythonMap = by(pythonEnvironments),
      nodeMap = by(nodeEnvironments),
      pythonBuildMap = by(pythonBuilds),
      nodeBuildMap = by(nodeBuilds),
      assetMap = by(assets), runtimeMap = by(runtimes), toolchainMap = by(toolchains);
    return Promise.all(
      tasks.map(async (task: Task) => {
        const diagnostics: TaskDiagnostic[] = [];
        const diagnostic = (
          code: string,
          status: TaskDiagnostic['status'],
          resource_id?: number,
        ) =>
          diagnostics.push({
            code,
            status,
            ...(resource_id ? { resource_id } : {}),
          });
        const source = sourceMap.get(task.id),
          binding = bindingMap.get(task.id),
          execution = settingMap.get(task.id),
          worktree = source ? worktreeMap.get(source.worktree_id) : null,
          repository = worktree
            ? repositoryMap.get(worktree.repository_id)
            : null,
          subscription = task.subscription_id
            ? subscriptionMap.get(task.subscription_id)
            : null;
        if (!source)
          diagnostic('TASK_SOURCE_REQUIRED', 'CONFIGURATION_REQUIRED');
        else {
          try {
            taskSource(source);
          } catch {
            diagnostic('TASK_SOURCE_INVALID', 'INVALID');
          }
          if (!worktree)
            diagnostic(
              'TASK_WORKTREE_MISSING',
              'SOURCE_MISSING',
              source.worktree_id,
            );
          else if (worktree.lifecycle_state !== 'READY')
            diagnostic(
              'TASK_WORKTREE_UNAVAILABLE',
              'RESOURCE_UNAVAILABLE',
              worktree.id,
            );
          if (!repository || repository.storage_state === 'DELETING')
            diagnostic('TASK_REPOSITORY_UNAVAILABLE', 'RESOURCE_UNAVAILABLE');
          if (
            task.origin === 'DISCOVERED' &&
            (!subscription || subscription.worktree_id !== source.worktree_id)
          )
            diagnostic('TASK_WORKTREE_OWNER_MISMATCH', 'INVALID');
          if (deep && worktree?.local_path) {
            try {
              await validateTaskSourceFiles(worktree.local_path, source);
            } catch (error: any) {
              diagnostic(
                error.code === 'ENOENT'
                  ? 'TASK_ENTRYPOINT_MISSING'
                  : error.error_code ?? 'TASK_SOURCE_UNAVAILABLE',
                error.code === 'ENOENT' ? 'SOURCE_MISSING' : 'INVALID',
              );
            }
          } else if (deep && worktree && !worktree.local_path)
            diagnostic('TASK_WORKTREE_MISSING', 'SOURCE_MISSING');
        }
        const kind = source
          ? runtimeKind(source.language)
          : binding?.kind ?? null;
        let selected = binding,
          selected_by =
            binding &&
            (kind === 'SHELL' ||
              binding.python_environment_id ||
              binding.node_environment_id)
              ? 'TASK'
              : 'UNBOUND';
        if (selected_by === 'UNBOUND' && kind !== 'SHELL') {
          selected = defaults.find(
            (d) =>
              d.subscription_id === task.subscription_id &&
              d.subscription_id != null &&
              d.kind === kind,
          );
          if (selected) selected_by = 'SUBSCRIPTION';
          else {
            selected = defaults.find(
              (d) =>
                d.repository_id === repository?.id &&
                d.repository_id != null &&
                d.kind === kind,
            );
            if (selected) selected_by = 'REPOSITORY';
          }
        }
        if (source && binding)
          try {
            taskRuntime(binding, source.language);
          } catch {
            diagnostic('TASK_RUNTIME_KIND_MISMATCH', 'INVALID');
          }
        const environmentId =
          kind === 'PYTHON'
            ? selected?.python_environment_id
            : kind === 'NODE'
            ? selected?.node_environment_id
            : null;
        if (kind && kind !== 'SHELL') {
          if (!environmentId)
            diagnostic('TASK_RUNTIME_REQUIRED', 'CONFIGURATION_REQUIRED');
          else {
            const environment = (kind === 'PYTHON' ? pythonMap : nodeMap).get(
                environmentId,
              ),
              build = environment
                ? (kind === 'PYTHON' ? pythonBuildMap : nodeBuildMap).get(
                    environment.current_build_id,
                  )
                : null;
            if (
              !environment ||
              environment.state !== 'READY' ||
              !build ||
              build.environment_id !== environment.id ||
              build.state !== 'READY' ||
              build.health !== 'HEALTHY' ||
              runtimeMap.get(build.runtime_id)?.state !== 'READY' ||
              (kind === 'NODE' && (toolchainMap.get(build.toolchain_id)?.state !== 'READY' || toolchainMap.get(build.toolchain_id)?.runtime_id !== build.runtime_id))
            )
              diagnostic(
                'TASK_ENVIRONMENT_UNAVAILABLE',
                'RESOURCE_UNAVAILABLE',
                environmentId,
              );
          }
        }
        const profileId =
          task.env_profile_id ??
          subscription?.env_profile_id ??
          repository?.default_env_profile_id ??
          null;
        const profile = profileId ? profileMap.get(profileId) : null;
        if (profileId && (!profile || profile.repository_id !== repository?.id))
          diagnostic('TASK_PROFILE_REPOSITORY_MISMATCH', 'INVALID', profileId);
        else if (profile?.status !== undefined && profile.status !== 'enabled')
          diagnostic(
            'TASK_PROFILE_DISABLED',
            'RESOURCE_UNAVAILABLE',
            profileId,
          );
        const config = new Map<string, any>();
        for (const [rows, origin] of [
          [
            repositoryConfigs.filter((b) => b.repository_id === repository?.id),
            'REPOSITORY',
          ],
          [taskConfigs.filter((b) => b.task_id === task.id), 'TASK'],
        ] as const)
          for (const row of rows)
            if (row.enabled) {
              try {
                targetPath(row.target_path);
                if (
                  !['TASK_DIR', 'WORKSPACE_ROOT'].includes(row.target_base) ||
                  !['ATTACH', 'MASK'].includes(row.operation)
                )
                  throw Error();
              } catch {
                diagnostic('TASK_CONFIG_INVALID', 'INVALID', row.id);
              }
              const key = row.target_base + ':' + row.target_path;
              if (row.operation === 'MASK') config.delete(key);
              else {
                const asset = assetMap.get(row.asset_id);
                if (
                  !asset?.current_revision_id ||
                  !configRevisions.some(
                    (revision) =>
                      revision.id === asset.current_revision_id &&
                      revision.asset_id === asset.id,
                  )
                )
                  diagnostic(
                    'TASK_CONFIG_UNAVAILABLE',
                    'RESOURCE_UNAVAILABLE',
                    row.asset_id,
                  );
                config.set(key, {
                  binding_id: row.id,
                  asset_id: row.asset_id,
                  name: asset?.name ?? null,
                  is_secret: asset?.is_secret ?? false,
                  target_base: row.target_base,
                  target_path: row.target_path,
                  origin,
                });
              }
            }
        const taskHooks = hooks.filter(
          (h) => h.task_id === task.id && h.enabled,
        );
        for (const hook of taskHooks)
          if (
            !['BEFORE', 'AFTER_SUCCESS', 'AFTER_FAILURE', 'FINALLY'].includes(
              hook.phase,
            ) ||
            !['FAIL_EXECUTION', 'CONTINUE'].includes(hook.failure_policy) ||
            !['TASK_CWD', 'WORKSPACE_ROOT'].includes(hook.cwd_base) ||
            hook.timeout_seconds < 1 ||
            hook.timeout_seconds > 3600
          )
            diagnostic('TASK_HOOK_INVALID', 'INVALID', hook.id);
        let validatedSettings = null;
        try {
          if (!execution) throw Error();
          validatedSettings = taskSettings(execution);
        } catch {
          diagnostic('TASK_SETTINGS_INVALID', 'INVALID');
        }
        const priority: TaskReadiness[] = [
          'INVALID',
          'SOURCE_MISSING',
          'RESOURCE_UNAVAILABLE',
          'CONFIGURATION_REQUIRED',
        ];
        const status =
          priority.find((s) => diagnostics.some((d) => d.status === s)) ??
          'READY';
        return {
          task: {
            id: task.id,
            name: task.name,
            enabled: task.enabled,
            origin: task.origin,
            version: task.version,
          },
          source: source
            ? {
                type: source.type,
                worktree_id: source.worktree_id,
                repository_id: repository?.id ?? null,
                relative_entrypoint: source.relative_entrypoint,
                language: source.language,
                cwd_mode: source.cwd_mode,
                cwd_relative_path: source.cwd_relative_path,
              }
            : null,
          runtime: {
            kind,
            environment_id: environmentId ?? null,
            selected_by,
            execution_activation: 'PHASE_10',
          },
          environment: {
            profile_id: profileId,
            name: profile?.name ?? null,
            selected_by:
              task.env_profile_id != null
                ? 'TASK'
                : subscription?.env_profile_id != null
                ? 'SUBSCRIPTION'
                : profileId
                ? 'REPOSITORY'
                : 'NONE',
          },
          config: [...config.values()],
          hooks: taskHooks.map((h) => ({ id: h.id, phase: h.phase })),
          settings: validatedSettings,
          readiness: { status, diagnostics, source_checked: deep },
        };
      }),
    );
  }
  async detail(id: number, deep = false) {
    const result = (await this.resolve([id], undefined, deep))[0];
    if (!result) throw new TaskDefinitionError('TASK_NOT_FOUND', 404);
    return result;
  }
}
