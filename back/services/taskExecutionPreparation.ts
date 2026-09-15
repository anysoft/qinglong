import fs from 'fs/promises';
import path from 'path';
import { sequelize } from '../data';
import { Crontab, CrontabModel } from '../data/cron';
import { TaskHook } from '../data/configAsset';
import TaskEnvironmentResolver, {
  ResolvedTaskEnvironment,
} from './taskEnvironmentResolver';
import RepositoryEnvProfileService from './repositoryEnvProfile';
import ExecutionEnvironmentTransport from './executionEnvironmentTransport';
import TaskConfigService, { ResolvedConfig } from './taskConfig';
import TaskHookService from './taskHooks';
import TaskWorkspaceResolver from './taskWorkspace';
import ConfigAssetService from './configAsset';
import { TaskWorkspace } from './configMaterialization';
import {
  ConfigAssetError,
  configId,
  atomicPrivateWrite,
} from '../shared/configAssets';
export interface TaskExecutionPreparation {
  version: 1;
  task: Crontab | null;
  workspace: TaskWorkspace;
  configs: ResolvedConfig[];
  hooks: TaskHook[];
  environment: ResolvedTaskEnvironment;
  secretValues: string[];
  args: string[];
  directory: string;
  mainTimeout: number;
}
export default class TaskExecutionPreparationService {
  async prepare(
    taskId: number | null,
    args: string[],
    base: NodeJS.ProcessEnv,
    mainTimeout = 0,
  ) {
    const resolved = await sequelize.transaction(async (transaction) => {
      const task = taskId
        ? (await CrontabModel.findByPk(configId(taskId), { transaction }))?.get(
            { plain: true },
          ) ?? null
        : null;
      if (taskId && !task) throw new ConfigAssetError('TASK_NOT_FOUND', 404);
      const environment = await new TaskEnvironmentResolver(
        new RepositoryEnvProfileService(),
      ).resolve(task, base, transaction);
      const configs = await new TaskConfigService().resolve(
        taskId,
        transaction,
      );
      const hooks = taskId
        ? (await new TaskHookService().list(taskId, transaction))
            .map((x) => x.get({ plain: true }))
            .filter((x) => x.enabled)
        : [];
      return { task, environment, configs, hooks };
    });
    const workspace = await new TaskWorkspaceResolver().resolve(
      resolved.task,
      args,
    );
    const secretValues = resolved.environment.secretNames
      .map((name) => resolved.environment.variables[name])
      .filter(Boolean);
    for (const entry of resolved.configs)
      if (entry.is_secret)
        secretValues.push(
          (
            await new ConfigAssetService().readRevision(entry.revision)
          ).toString('utf8'),
        );
    const transport = await new ExecutionEnvironmentTransport().prepare(
      resolved.environment,
      process.pid,
    );
    try {
      const plan: TaskExecutionPreparation = {
        version: 1,
        ...resolved,
        workspace,
        secretValues,
        args,
        directory: transport.directory,
        mainTimeout,
      };
      await atomicPrivateWrite(
        path.join(transport.directory, 'preparation.json'),
        JSON.stringify(plan),
      );
      return { plan, cleanup: transport.cleanup };
    } catch (error) {
      await transport.cleanup();
      throw error;
    }
  }
}
