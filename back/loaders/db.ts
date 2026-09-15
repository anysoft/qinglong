import Logger from './logger';
import { EnvModel } from '../data/env';
import { CrontabModel } from '../data/cron';
import { DependenceModel } from '../data/dependence';
import { AppModel } from '../data/open';
import { SystemModel } from '../data/system';
import { SubscriptionModel } from '../data/subscription';
import { CrontabViewModel } from '../data/cronView';
import { CrontabStatModel } from '../data/cronStats';
import { RunningInstanceModel } from '../data/runningInstance';
import { sequelize } from '../data';
import { migrateSchema } from '../shared/schemaMigrations';
import ExecutionEnvironmentTransport from '../services/executionEnvironmentTransport';

export default async () => {
  try {
    await CrontabModel.sync();
    await DependenceModel.sync();
    await AppModel.sync();
    await SystemModel.sync();
    await EnvModel.sync();
    await SubscriptionModel.sync();
    await CrontabViewModel.sync();
    await CrontabStatModel.sync();
    await RunningInstanceModel.sync();

    await migrateSchema(sequelize);
    await new ExecutionEnvironmentTransport().cleanupStale().catch(() => {
      Logger.warn('[environment] stale snapshot cleanup deferred');
    });

    Logger.info('[boot] DB loaded');
  } catch (error) {
    Logger.error('[boot] DB load failed', error);
    throw error;
  }
};
