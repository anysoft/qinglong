import { resolveFileAccess } from '../shared/fileAccess';
import { Service, Inject } from 'typedi';
import winston from 'winston';
import path, { join } from 'path';
import SockService from './sock';
import CurrentTaskBridgeService from './cron';
import ScheduleService, { TaskCallbacks } from './schedule';
import config from '../config';
import { TASK_COMMAND } from '../config/const';
import { getFileContentByName, getPid, killTask, rmPath } from '../config/util';
import taskLimit from '../shared/pLimit';

@Service()
export default class ScriptService {
  constructor(
    @Inject('logger') private logger: winston.Logger,
    private sockService: SockService,
    private cronService: CurrentTaskBridgeService,
    private scheduleService: ScheduleService,
  ) {}

  private taskCallbacks(filePath: string): TaskCallbacks {
    return {
      onEnd: async (cp, endTime, diff) => {
        await rmPath(filePath);
      },
      onError: async (message: string) => {
        this.sockService.sendMessage({
          type: 'manuallyRunScript',
          message,
        });
      },
      onLog: async (message: string) => {
        this.sockService.sendMessage({
          type: 'manuallyRunScript',
          message,
        });
      },
    };
  }

  public async runScript(filePath: string) {
    return {
      code: 409,
      error_code: 'TASK_DEFINITION_REQUIRED',
      message: '请在 Tasks 中选择 Worktree 文件后运行。',
    };
  }

  public async stopScript(filePath: string, pid: number) {
    return {
      code: 409,
      error_code: 'TASK_RUN_REQUIRED',
      message: '请在 Tasks 中取消对应的 Run。',
    };
  }

  public checkFilePath(filePath: string, fileName: string) {
    return resolveFileAccess(
      config.scriptPath,
      [filePath || '', fileName],
      config.blackFileList,
    );
  }

  public async getFile(filePath: string, fileName: string) {
    const finalPath = this.checkFilePath(filePath, fileName);

    if (!finalPath) {
      return '';
    }

    const content = await getFileContentByName(finalPath);
    return content;
  }
}
