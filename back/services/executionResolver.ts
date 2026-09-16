import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { TaskModel } from '../data/task';
import { WorktreeModel } from '../data/worktree';
import { PythonEnvironmentModel } from '../data/pythonEnvironment';
import { NodeEnvironmentModel } from '../data/nodeEnvironment';
import { RepositoryPathResolver } from '../shared/workspacePaths';
import {
  taskArguments,
  taskSource,
  validateTaskSourceFiles,
} from '../shared/taskDefinition';
import {
  ExecutionContext,
  ExecutionError,
  freezeExecutionSnapshot,
} from '../shared/execution';
import TaskResourceResolver from './taskResourceResolver';
import TaskEnvironmentResolver from './taskEnvironmentResolver';
import RepositoryEnvProfileService from './repositoryEnvProfile';
import TaskConfigService from './taskConfig';
import TaskHookService from './taskHooks';
import ConfigAssetService from './configAsset';
import RuntimeOperationService from './runtimeOperations';
import PythonEnvironmentResolver from './pythonEnvironmentResolver';
import NodeEnvironmentResolver from './nodeEnvironmentResolver';
import { RuntimeLease } from './runtimeProcess';
import ExecutionPaths from './executionPaths';

const hash = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
export default class ExecutionResolver {
  constructor(
    readonly operations = new RuntimeOperationService(),
    readonly paths = new ExecutionPaths(),
  ) {}
  private async snapshot(taskId: number, transaction: Transaction) {
    const resources = (
      await new TaskResourceResolver().resolve([taskId], transaction)
    )[0];
    const task = (await TaskModel.findByPk(taskId, { transaction }))?.get({
      plain: true,
    });
    if (!task || !resources) throw new ExecutionError('TASK_NOT_FOUND', 404);
    if (
      resources.readiness.status !== 'READY' ||
      !resources.source ||
      !resources.settings
    )
      throw new ExecutionError('TASK_NOT_READY');
    const worktree = (
      await WorktreeModel.findByPk(resources.source.worktree_id, {
        transaction,
      })
    )?.get({ plain: true });
    if (!worktree) throw new ExecutionError('TASK_WORKTREE_MISSING');
    const environment = await new TaskEnvironmentResolver(
      new RepositoryEnvProfileService(),
    ).resolve(taskId, { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, transaction);
    const configs = await new TaskConfigService().resolve(taskId, transaction);
    const hooks = (await new TaskHookService().list(taskId, transaction))
      .map((row) => row.get({ plain: true }))
      .filter((row) => row.enabled);
    const environmentRow =
      resources.runtime.kind === 'PYTHON'
        ? await PythonEnvironmentModel.findByPk(
            resources.runtime.environment_id!,
            { transaction },
          )
        : resources.runtime.kind === 'NODE'
        ? await NodeEnvironmentModel.findByPk(
            resources.runtime.environment_id!,
            { transaction },
          )
        : null;
    return {
      task,
      resources,
      worktree,
      environment,
      configs,
      hooks,
      buildId: environmentRow?.get('current_build_id') ?? null,
    };
  }
  async resolve(taskId: number, taskRunId: number) {
    const selected = await sequelize.transaction((t) =>
      this.snapshot(taskId, t),
    );
    const stamp = hash(JSON.stringify(selected));
    const leases: RuntimeLease[] = [];
    try {
      const worktreeLease = await this.paths.worktree(selected.worktree.id!);
      leases.push(worktreeLease);
      const source = taskSource(selected.resources.source!);
      const repositoryPaths = new RepositoryPathResolver(this.paths.dataRoot);
      const root = await repositoryPaths.worktree(
        selected.worktree.repository_id,
        selected.worktree.id!,
      );
      if (selected.worktree.local_path !== root)
        throw new ExecutionError('TASK_WORKTREE_PATH_INVALID');
      await validateTaskSourceFiles(root, source);
      const entry = path.join(root, source.relative_entrypoint),
        taskDir = path.dirname(entry);
      const cwd =
        source.cwd_mode === 'WORKTREE_ROOT'
          ? root
          : source.cwd_mode === 'CUSTOM_RELATIVE'
          ? path.join(root, source.cwd_relative_path!)
          : taskDir;
      let runtime: ExecutionContext['runtime'] = {
        kind: 'SHELL',
        executable: '/bin/sh',
      };
      if (selected.resources.runtime.kind === 'PYTHON') {
        const pinned = await new PythonEnvironmentResolver(
          this.operations,
        ).resolve(selected.resources.runtime.environment_id!);
        leases.push(pinned.lease);
        const s = pinned.snapshot;
        if (s.build_id !== selected.buildId)
          throw new ExecutionError('EXECUTION_SNAPSHOT_CHANGED');
        runtime = {
          kind: 'PYTHON',
          executable: s.python_executable,
          environmentId: s.environment_id,
          revisionId: s.revision_id,
          buildId: s.build_id,
          runtimeId: s.runtime_id,
          venvRoot: s.venv_root,
          dependencyHash: s.resolved_dependency_hash ?? undefined,
        };
      } else if (selected.resources.runtime.kind === 'NODE') {
        const pinned = await new NodeEnvironmentResolver(
          this.operations.node,
        ).resolve(selected.resources.runtime.environment_id!);
        leases.push(pinned.lease);
        const s = pinned.snapshot;
        if (s.build_id !== selected.buildId)
          throw new ExecutionError('EXECUTION_SNAPSHOT_CHANGED');
        leases.push(
          await this.operations.node.paths.lease(
            'runtime',
            s.runtime_id,
            'shared',
          ),
        );
        leases.push(
          await this.operations.node.paths.lease(
            'toolchain',
            s.toolchain_id,
            'shared',
          ),
        );
        runtime = {
          kind: 'NODE',
          executable: s.node_executable,
          environmentId: s.environment_id,
          revisionId: s.revision_id,
          buildId: s.build_id,
          runtimeId: s.runtime_id,
          toolchainId: s.toolchain_id,
          buildRoot: s.build_root,
          nodeModulesRoot: s.node_modules_root,
          dependencyHash: s.lockfile_identity,
        };
        if (source.language === 'TYPESCRIPT') {
          const packageFile = await fs.realpath(
            path.join(s.node_modules_root, 'tsx/package.json'),
          );
          const cli = await fs.realpath(
            path.join(s.node_modules_root, 'tsx/dist/cli.mjs'),
          );
          for (const file of [packageFile, cli])
            if (
              !file.startsWith(s.build_root + path.sep) ||
              !(await fs.stat(file)).isFile()
            )
              throw new ExecutionError('TSX_BUILD_PATH_INVALID');
          const manifest = JSON.parse(await fs.readFile(packageFile, 'utf8'));
          if (
            manifest.name !== 'tsx' ||
            !/^4\.\d+\.\d+$/.test(manifest.version) ||
            !['./dist/cli.mjs', 'dist/cli.mjs'].includes(
              typeof manifest.bin === 'string'
                ? manifest.bin
                : manifest.bin?.tsx,
            )
          )
            throw new ExecutionError('TSX_VERSION_UNSUPPORTED');
          runtime.tsxCli = cli;
          runtime.tsxVersion = manifest.version;
        }
      }
      for (const binding of selected.configs) {
        if (
          binding.binding.target_path
            .split('/')
            .some(
              (part) =>
                part === 'node_modules' ||
                part === '.git' ||
                part.startsWith('.platform'),
            )
        )
          throw new ExecutionError('CONFIG_RESERVED_WORKSPACE');
      }
      const check = await sequelize.transaction((t) =>
        this.snapshot(taskId, t),
      );
      if (hash(JSON.stringify(check)) !== stamp)
        throw new ExecutionError('EXECUTION_SNAPSHOT_CHANGED');
      const variables = { ...selected.environment.variables };
      // Managed runtimes never inherit host dependency paths or loader injection.
      for (const name of Object.keys(variables))
        if (
          /^(?:NODE_PATH|NODE_OPTIONS|PYTHONPATH|PYTHONHOME|PYTHONSTARTUP|BASH_ENV|ENV|LD_.*|DYLD_.*|QL_.*|BACK_PORT|GRPC_PORT)$/.test(
            name,
          )
        )
          delete variables[name];
      variables.PATH = `${path.dirname(runtime.executable)}:/usr/bin:/bin`;
      if (runtime.venvRoot) {
        variables.VIRTUAL_ENV = runtime.venvRoot;
        variables.PYTHONNOUSERSITE = '1';
      }
      variables.PLATFORM_TASK_ID = String(taskId);
      variables.PLATFORM_RUN_ID = String(taskRunId);
      const secrets = selected.environment.secretNames
        .map((name) => selected.environment.variables[name])
        .filter(Boolean);
      for (const item of selected.configs)
        if (item.is_secret)
          secrets.push(
            (
              await new ConfigAssetService().readRevision(item.revision)
            ).toString('utf8'),
          );
      const context: ExecutionContext = freezeExecutionSnapshot(
        JSON.parse(
          JSON.stringify({
            identity: {
              taskId,
              taskRunId,
              taskDefinitionVersion: selected.task.version,
            },
            source: {
              repositoryId: selected.worktree.repository_id,
              worktreeId: selected.worktree.id,
              relativeEntrypoint: source.relative_entrypoint,
              absoluteEntrypoint: entry,
              language: source.language,
              cwd,
              checksum: hash(await fs.readFile(entry)),
            },
            runtime,
            args: taskArguments(selected.task.arguments),
            environmentSnapshot: { ...selected.environment, variables },
            configSnapshot: selected.configs,
            hookSnapshot: selected.hooks,
            settings: selected.resources.settings,
            workspace: {
              workspaceRoot: root,
              taskDir,
              cwd,
              resourceKey: this.paths.resourceKey(selected.worktree.id!),
              reservedTopLevelPattern:
                '^(?:node_modules|\\.git|\\.platform.*)$',
            },
            secretValues: secrets,
          }),
        ),
      );
      return {
        context,
        leases,
        materializationLease: this.paths.materializationLease(
          selected.worktree.id!,
          worktreeLease,
        ),
        async release() {
          for (const lease of [...leases].reverse()) await lease.release();
        },
      };
    } catch (error) {
      for (const lease of leases.reverse()) await lease.release();
      throw error;
    }
  }
}
