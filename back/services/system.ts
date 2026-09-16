import { Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Inject, Service } from 'typedi';
import winston from 'winston';
import config from '../config';
import { NotificationModeStringMap } from '../config/const';
import {
  readDirs,
  rmPath,
  setSystemTimezone,
} from '../config/util';
import { NotificationInfo } from '../data/notify';
import {
  AuthDataType,
  SystemInfo,
  SystemModel,
  SystemModelInfo,
} from '../data/system';
import NotificationService from './notify';
import dayjs from 'dayjs';
import { t, setLang } from '../shared/i18n';
import { Container } from 'typedi';
import RetentionService from './retention';

@Service()
export default class SystemService {
  @Inject((type) => NotificationService)
  private notificationService!: NotificationService;

  constructor(
    @Inject('logger') private logger: winston.Logger,
  ) { }

  public async getSystemConfig() {
    const doc = await this.getDb({ type: AuthDataType.systemConfig });
    return {
      ...doc,
      info: { ...doc.info, timezone: doc.info?.timezone || 'Asia/Shanghai' },
    };
  }

  private async updateAuthDb(payload: SystemInfo): Promise<SystemInfo> {
    const { id, ...others } = payload;
    await SystemModel.update(others, { where: { id } });
    const doc = await this.getDb({ id });
    return doc;
  }

  public async getDb(query: any): Promise<SystemInfo> {
    const doc = await SystemModel.findOne({ where: query });
    if (!doc) {
      throw new Error(`System ${JSON.stringify(query)} not found`);
    }
    return doc.get({ plain: true });
  }

  public async updateNotificationMode(notificationInfo: NotificationInfo) {
    const code = Math.random().toString().slice(-6);
    const isSuccess = await this.notificationService.testNotify(
      notificationInfo,
      t('青龙'),
      t('【蛟龙】测试通知 https://t.me/jiao_long'),
    );
    if (isSuccess) {
      const result = await this.updateAuthDb({
        type: AuthDataType.notification,
        info: { ...notificationInfo },
      });
      return { code: 200, data: { ...result, code } };
    } else {
      return { code: 400, message: t('通知发送失败，请检查参数') };
    }
  }

  public configureLogRetention(days?: number | null) {
    Container.get(RetentionService).configure(days || 0, this.logger);
  }

  public async updateLogRemoveFrequency(info: SystemModelInfo) {
    const oDoc = await this.getSystemConfig();
    const result = await this.updateAuthDb({
      ...oDoc,
      info: { ...oDoc.info, ...info },
    });
    this.configureLogRetention(info.logRemoveFrequency);
    return { code: 200, data: info };
  }

  public async notify({
    title,
    content,
    notificationInfo,
  }: {
    title: string;
    content: string;
    notificationInfo?: NotificationInfo;
  }) {
    const typeString =
      typeof notificationInfo?.type === 'number'
        ? NotificationModeStringMap[notificationInfo.type]
        : undefined;
    if (notificationInfo && typeString) {
      notificationInfo.type = typeString;
    }
    const isSuccess = await this.notificationService.notify(
      title,
      content,
      notificationInfo,
    );
    if (isSuccess) {
      return { code: 200, message: t('通知发送成功') };
    } else {
      return { code: 400, message: t('通知发送失败，请检查系统设置/通知配置') };
    }
  }

  public async getSystemLog(
    res: Response,
    query: {
      startTime?: string;
      endTime?: string;
      limit?: number;
    },
  ) {
    const startTime = dayjs(query.startTime || undefined)
      .startOf('d')
      .valueOf();
    const endTime = dayjs(query.endTime || undefined)
      .endOf('d')
      .valueOf();
    const result = await readDirs(config.systemLogPath, config.systemLogPath);
    const logs = result
      .reverse()
      .filter((x) => x.title.endsWith('.log'))
      .filter((x) => x.createTime >= startTime && x.createTime <= endTime);

    const limit = Math.min(
      Math.max(Number(query.limit) || 1024 * 1024, 1),
      1024 * 1024,
    );
    const total = logs.reduce((size, log) => size + (log.size || 0), 0);
    let remaining = limit;
    const selected: Array<
      (typeof logs)[number] & { start: number; length: number }
    > = [];
    for (let index = logs.length - 1; index >= 0 && remaining > 0; index--) {
      const log = logs[index];
      const size = log.size || 0;
      const length = Math.min(size, remaining);
      if (length > 0) {
        selected.unshift({ ...log, start: size - length, length });
        remaining -= length;
      }
    }

    const contentLength = selected.reduce((size, log) => size + log.length, 0);
    res.set({
      'Content-Length': contentLength,
      'X-QL-Log-Total': total,
      'X-QL-Log-Truncated': total > contentLength ? 'true' : 'false',
    });
    (function sendFiles(res, fileNames) {
      if (fileNames.length === 0) {
        res.end();
        return;
      }

      const currentLog = fileNames.shift();
      if (currentLog) {
        const currentFileStream = fs.createReadStream(
          path.join(config.systemLogPath, currentLog.title),
          {
            start: currentLog.start,
            end: currentLog.start + currentLog.length - 1,
          },
        );
        currentFileStream.on('end', () => {
          sendFiles(res, fileNames);
        });
        currentFileStream.pipe(res, { end: false });
      }
    })(res, selected);
  }

  public async deleteSystemLog() {
    const result = await readDirs(config.systemLogPath, config.systemLogPath);
    const logs = result.reverse().filter((x) => x.title.endsWith('.log'));
    for (const log of logs) {
      await rmPath(path.join(config.systemLogPath, log.title));
    }
  }

  public async updateTimezone(info: SystemModelInfo) {
    if (!info.timezone) {
      info.timezone = 'Asia/Shanghai';
    }
    const oDoc = await this.getSystemConfig();
    await this.updateAuthDb({
      ...oDoc,
      info: { ...oDoc.info, ...info },
    });
    const success = await setSystemTimezone(info.timezone);
    if (success) {
      return { code: 200, data: info };
    } else {
      return { code: 400, message: t('设置时区失败') };
    }
  }

  public async updateLanguage(info: SystemModelInfo) {
    const oDoc = await this.getSystemConfig();
    const lang = info.lang || 'zh';
    await this.updateAuthDb({
      ...oDoc,
      info: { ...oDoc.info, lang },
    });
    setLang(lang);
    return { code: 200, data: { lang } };
  }

  public async updatePanelTitle(info: SystemModelInfo) {
    const oDoc = await this.getSystemConfig();
    const panelTitle = info.panelTitle?.trim() || '';
    await this.updateAuthDb({
      ...oDoc,
      info: { ...oDoc.info, panelTitle },
    });
    return { code: 200, data: { panelTitle } };
  }
}
