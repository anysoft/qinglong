import { resolveFileAccess } from '../shared/fileAccess';
import path from 'path';
import { Inject, Service } from 'typedi';
import winston from 'winston';
import config from '../config';

@Service()
export default class LogService {
  constructor(@Inject('logger') private logger: winston.Logger) {}

  public checkFilePath(filePath: string, fileName: string) {
    const resolved = resolveFileAccess(
      config.logPath,
      [filePath || '', fileName],
      config.blackFileList,
    );
    const runRoot = path.join(config.logPath, 'task-runs');
    if (resolved && (resolved === runRoot || resolved.startsWith(runRoot + path.sep))) return null;
    return resolved;
  }
}
