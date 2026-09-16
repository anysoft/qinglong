import { discoveryModels } from '../data/discoveryPolicy';
import { triggerModels } from '../data/taskTrigger';
import { nodeEnvironmentModels } from '../data/nodeEnvironment';
import { taskModels } from '../data/task';
import { taskRunModels } from '../data/taskRun';
import { pythonEnvironmentModels } from '../data/pythonEnvironment';
import Logger from './logger';
import { runtimeModels } from '../data/runtime';
import { configAssetModels } from '../data/configAsset';
import { EnvModel } from '../data/env';
import { SchedulerProjectionModel } from '../data/cron';
import { DependenceModel } from '../data/dependence';
import { AppModel } from '../data/open';
import { SystemModel } from '../data/system';
import { SubscriptionModel } from '../data/subscription';
import { TaskViewModel } from '../data/cronView';
import { TaskStatModel } from '../data/cronStats';
import { RunningInstanceModel } from '../data/runningInstance';
import { sequelize } from '../data';
import { initializeOperationalSchema } from '../shared/operationalSchema';
import { bootstrapDirectories } from '../shared/bootstrapDirectories';
import config from '../config';
import { GitCredentialModel } from '../data/gitCredential';
import { RepositoryModel } from '../data/repository';
import { WorktreeModel } from '../data/worktree';
import {
  EnvironmentProfileModel,
  RepositoryEnvVariableModel,
  TaskEnvVariableModel,
} from '../data/scopedEnv';
import ExecutionEnvironmentTransport from '../services/executionEnvironmentTransport';

export default async () => {
  try {
    await bootstrapDirectories(config.dataPath);
    await initializeOperationalSchema(sequelize, [
      GitCredentialModel,
      RepositoryModel,
      WorktreeModel,
      EnvironmentProfileModel,
      SubscriptionModel,
      SchedulerProjectionModel,
      RepositoryEnvVariableModel,
      TaskEnvVariableModel,
      EnvModel,
      DependenceModel,
      AppModel,
      SystemModel,
      TaskViewModel,
      TaskStatModel,
      RunningInstanceModel,
      ...configAssetModels,
      ...runtimeModels,
      ...pythonEnvironmentModels,
      ...nodeEnvironmentModels,
      ...taskModels,
      ...taskRunModels,
      ...triggerModels,
      ...discoveryModels,
    ]);
    await new ExecutionEnvironmentTransport().cleanupStale().catch(() => {
      Logger.warn('[environment] stale snapshot cleanup deferred');
    });

    Logger.info('[boot] DB loaded');
  } catch (error) {
    Logger.error('[boot] DB load failed', error);
    throw error;
  }
};
