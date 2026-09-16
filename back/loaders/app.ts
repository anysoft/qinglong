import expressLoader from './express';
import depInjectorLoader from './depInjector';
import Logger from './logger';
import initData from './initData';
import { Application } from 'express';
import initTask from './initTask';
import initFile from './initFile';
import { initializeTrustProxy } from '../shared/trustProxy';

export default async ({ app }: { app: Application }) => {
  depInjectorLoader();
  Logger.info('[boot] Dependency loaded');

  await initFile();
  Logger.info('[boot] Init file loaded');

  await initData();
  Logger.info('[boot] Init data loaded');

  await initTask();
  Logger.info('[boot] Init task loaded');

  expressLoader({ app });
  await initializeTrustProxy(app);
  Logger.info('[boot] Express loaded');
};
