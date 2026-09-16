import fs from 'fs/promises';
import path from 'path';
import config from '../config';
import Logger from './logger';

/** Platform-owned directories only; workspace content and SDKs are explicit resources. */
export default async () => {
  for (const directory of [config.configPath, config.logPath, config.tmpPath,
    config.uploadPath, config.systemLogPath, path.join(config.logPath, '.tmp')]) {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  }
  Logger.info('[boot] Platform directories initialized');
};
