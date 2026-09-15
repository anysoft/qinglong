import { sequelize } from '../data';
import ManagedSubscriptionService from './managedSubscription';
import SubscriptionGitResolver from './subscriptionGit';
import { repositorySubscriptionCommand } from '../shared/subscriptionGitCommand';
import { Service, Inject, Container } from 'typedi';
import winston from 'winston';
import config from '../config';
import {
  Subscription,
  SubscriptionInstance,
  SubscriptionModel,
  SubscriptionStatus,
} from '../data/subscription';
import { ChildProcessWithoutNullStreams } from 'child_process';
import {
  getFileContentByName,
  concurrentRun,
  fileExist,
  createFile,
  killTask,
  handleLogPath,
  promiseExec,
  rmPath,
} from '../config/util';
import fs from 'fs/promises';
import { FindOptions, Op } from 'sequelize';
import path, { join } from 'path';
import ScheduleService, { TaskCallbacks } from './schedule';
import { SimpleIntervalSchedule } from 'toad-scheduler';
import SockService from './sock';
import { t, tf } from '../shared/i18n';
import SshKeyService from './sshKey';
import dayjs from 'dayjs';
import { LOG_END_SYMBOL } from '../config/const';
import { formatCommand, formatUrl } from '../config/subscription';
import { CrontabModel } from '../data/cron';
import CrontabService from './cron';
import taskLimit from '../shared/pLimit';
import { logStreamManager } from '../shared/logStreamManager';
import { LogReadOptions, readLogChunk } from '../shared/logReader';

@Service()
export default class SubscriptionService {
  constructor(
    @Inject('logger') private logger: winston.Logger,
    private scheduleService: ScheduleService,
    private sockService: SockService,
    private sshKeyService: SshKeyService,
    private crontabService: CrontabService,
  ) {}

  public async list(
    searchText?: string,
    ids?: string,
  ): Promise<SubscriptionInstance[]> {
    let query = {};
    const subIds = JSON.parse(ids || '[]');
    if (searchText) {
      const reg = {
        [Op.or]: [
          { [Op.like]: `%${searchText}%` },
          { [Op.like]: `%${encodeURI(searchText)}%` },
        ],
      };
      query = {
        [Op.or]: [
          {
            name: reg,
          },
          {
            url: reg,
          },
        ],
      };
    }
    try {
      const result = await SubscriptionModel.findAll({
        where: { ...query, ...(ids ? { id: subIds } : undefined) },
        order: [
          ['is_disabled', 'ASC'],
          ['createdAt', 'DESC'],
        ],
      });
      return result;
    } catch (error) {
      throw error;
    }
  }

  public async handleTask(
    doc: Subscription,
    needCreate = true,
    runImmediately = false,
  ) {
    doc.command = doc.repository_id
      ? repositorySubscriptionCommand(doc.id!)
      : formatCommand(doc, formatUrl(doc).url as string);

    if (doc.schedule_type === 'crontab') {
      this.scheduleService.cancelCronTask(doc as any);
      needCreate &&
        (await this.scheduleService.createCronTask(
          { ...doc, runOrigin: 'subscription' } as any,
          this.taskCallbacks(doc),
          runImmediately,
        ));
    } else if (doc.interval_schedule) {
      this.scheduleService.cancelIntervalTask(doc as any);
      const { type, value } = doc.interval_schedule;
      needCreate &&
        (await this.scheduleService.createIntervalTask(
          { ...doc, runOrigin: 'subscription' } as any,
          { [type]: value } as SimpleIntervalSchedule,
          runImmediately,
          this.taskCallbacks(doc),
        ));
    }
  }

  public async setSshConfig() {
    const docs = await SubscriptionModel.findAll();
    await this.sshKeyService.setSshConfig(docs.filter(doc => !doc.repository_id));
  }

  private taskCallbacks(doc: Subscription): TaskCallbacks {
    return {
      onBefore: async (startTime) => {
        const logTime = startTime.format('YYYY-MM-DD-HH-mm-ss');
        const logPath = `${doc.alias}/${logTime}.log`;
        await SubscriptionModel.update(
          {
            status: SubscriptionStatus.running,
            log_path: logPath,
          },
          { where: { id: doc.id } },
        );
        const absolutePath = await handleLogPath(
          logPath as string,
          tf('## 开始执行... %s\n', startTime.format('YYYY-MM-DD HH:mm:ss')),
        );

        // 执行sub_before
        let beforeStr = '';
        try {
          if (doc.sub_before) {
            await logStreamManager.write(absolutePath, `\n## ${t('执行before命令...')}\n\n`);
            beforeStr = await promiseExec(doc.sub_before);
          }
        } catch (error: any) {
          beforeStr =
            (error.stderr && error.stderr.toString()) || JSON.stringify(error);
        }
        if (beforeStr) {
          await logStreamManager.write(absolutePath, `${beforeStr}\n`);
        }
      },
      onStart: async (cp: ChildProcessWithoutNullStreams, startTime) => {
        await SubscriptionModel.update(
          {
            pid: cp.pid,
          },
          { where: { id: doc.id } },
        );
      },
      onEnd: async (cp, endTime, diff) => {
        let absolutePath: string | undefined;
        try {
          const sub = await this.getDb({ id: doc.id });
          absolutePath = await handleLogPath(sub.log_path as string);

          // 执行 sub_after
          let afterStr = '';
          try {
            if (sub.sub_after) {
              await logStreamManager.write(
                absolutePath,
                `\n\n## ${t('执行after命令...')}\n\n`,
              );
              afterStr = await promiseExec(sub.sub_after);
            }
          } catch (error: any) {
            afterStr =
              (error.stderr && error.stderr.toString()) || JSON.stringify(error);
          }
          if (afterStr) {
            await logStreamManager.write(absolutePath, `${afterStr}\n`);
          }

          await logStreamManager.write(
            absolutePath,
            '\n' +
              tf(
                '## 执行结束... %s  耗时 %s 秒',
                endTime.format('YYYY-MM-DD HH:mm:ss'),
                String(diff),
              ) +
              LOG_END_SYMBOL,
          );
        } finally {
          try {
            if (absolutePath) await logStreamManager.closeStream(absolutePath);
          } finally {
            await SubscriptionModel.update(
              { status: SubscriptionStatus.idle, pid: null } as any,
              { where: { id: doc.id } },
            );
            this.sockService.sendMessage({
              type: 'runSubscriptionEnd',
              message: t('订阅执行完成'),
              references: [doc.id as number],
            });
          }
        }
      },
      onError: async (message: string) => {
        const sub = await this.getDb({ id: doc.id });
        const absolutePath = await handleLogPath(sub.log_path as string);
        await logStreamManager.write(absolutePath, `\n${message}`);
      },
      onLog: async (message: string) => {
        const sub = await this.getDb({ id: doc.id });
        const absolutePath = await handleLogPath(sub.log_path as string);
        await logStreamManager.write(absolutePath, `\n${message}`);
      },
    };
  }

  public async create(payload: Subscription): Promise<Subscription> {
    const tab = new Subscription(payload);
    const save = async () =>
      tab.repository_id || tab.credential_id
        ? sequelize.transaction(async (transaction) => {
            await Container.get(
              SubscriptionGitResolver,
            ).resolveSubscriptionGitContext(tab, transaction);
            return SubscriptionModel.create(tab, { transaction });
          })
        : this.insert(tab);
    const doc =
      tab.git_mode === 'MANAGED'
        ? await Container.get(ManagedSubscriptionService).withBinding(
            tab,
            async (id) => {
              tab.worktree_id = id;
              return save();
            },
          )
        : await save();
    await this.handleTask(doc.get({ plain: true }));
    await this.setSshConfig();
    return doc;
  }

  public async insert(payload: Subscription): Promise<SubscriptionInstance> {
    return await SubscriptionModel.create(payload, { returning: true });
  }

  public async update(payload: Subscription): Promise<Subscription> {
    const current = await this.getDb({ id: payload.id });
    if (
      !current.repository_id &&
      !payload.repository_id &&
      !current.worktree_id
    )
      return this.updateUnlocked(payload);
    return Container.get(ManagedSubscriptionService).exclusive(
      payload.id!,
      () => this.updateUnlocked(payload),
    );
  }

  private async updateUnlocked(payload: Subscription): Promise<Subscription> {
    const doc = await this.getDb({ id: payload.id });
    const tab = new Subscription({ ...doc, ...payload });
    if (tab.repository_id !== doc.repository_id || tab.branch !== doc.branch)
      tab.worktree_id = null;
    const save = async () =>
      tab.repository_id || tab.credential_id
        ? sequelize.transaction(async (transaction) => {
            await Container.get(
              SubscriptionGitResolver,
            ).resolveSubscriptionGitContext(tab, transaction);
            await SubscriptionModel.update(tab, {
              where: { id: tab.id },
              transaction,
            });
            return tab;
          })
        : this.updateDb(tab);
    const newDoc =
      tab.git_mode === 'MANAGED'
        ? await Container.get(ManagedSubscriptionService).withBinding(
            tab,
            async (id) => {
              tab.worktree_id = id;
              return save();
            },
          )
        : await save();
    await this.handleTask(newDoc, !newDoc.is_disabled);
    await this.setSshConfig();
    return newDoc;
  }

  public async updateDb(payload: Subscription): Promise<Subscription> {
    await SubscriptionModel.update(payload, { where: { id: payload.id } });
    return await this.getDb({ id: payload.id });
  }

  public async status({
    ids,
    status,
    pid,
    log_path,
    last_running_time = 0,
    last_execution_time = 0,
  }: {
    ids: number[];
    status: SubscriptionStatus;
    pid: number;
    log_path: string;
    last_running_time: number;
    last_execution_time: number;
  }) {
    const options: any = {
      status,
      pid,
      log_path,
      last_execution_time,
    };
    if (last_running_time > 0) {
      options.last_running_time = last_running_time;
    }

    return await SubscriptionModel.update(
      { ...options },
      { where: { id: ids } },
    );
  }

  public async remove(ids: number[], query: { force?: boolean }) {
    const candidates = await SubscriptionModel.findAll({ where: { id: ids } });
    if (candidates.some((doc) => doc.repository_id || doc.worktree_id)) {
      const storage = Container.get(ManagedSubscriptionService);
      const acquire = (index: number): Promise<void> =>
        index === ids.length
          ? this.removeUnlocked(ids, query)
          : storage.exclusive([...ids].sort((a, b) => a - b)[index], () =>
              acquire(index + 1),
            );
      return acquire(0);
    }
    return this.removeUnlocked(ids, query);
  }

  private async removeUnlocked(ids: number[], query: { force?: boolean }) {
    const docs = await SubscriptionModel.findAll({ where: { id: ids } });
    for (const doc of docs) {
      await this.handleTask(doc.get({ plain: true }), false);
    }
    await SubscriptionModel.destroy({ where: { id: ids } });
    await this.setSshConfig();

    if (query?.force === true) {
      const crons = await CrontabModel.findAll({ where: { sub_id: ids } });
      if (crons?.length) {
        await this.crontabService.remove(crons.map((x) => x.id!));
      }
      for (const doc of docs) {
        if (doc.worktree_id || doc.git_mode === 'MANAGED') continue;
        const filePath = join(config.scriptPath, doc.alias);
        const repoPath = join(config.repoPath, doc.alias);
        await rmPath(filePath);
        await rmPath(repoPath);
      }
    }
  }

  public async getDb(
    query: FindOptions<Subscription>['where'],
  ): Promise<Subscription> {
    const doc = await SubscriptionModel.findOne({ where: { ...query } });
    if (!doc) {
      throw new Error(`Subscription ${JSON.stringify(query)} not found`);
    }
    return doc.get({ plain: true });
  }

  public async run(ids: number[]) {
    await SubscriptionModel.update(
      { status: SubscriptionStatus.queued },
      { where: { id: ids } },
    );
    ids.forEach((id) => {
      this.runSingle(id);
    });
  }

  public async stop(ids: number[]) {
    const docs = await SubscriptionModel.findAll({ where: { id: ids } });
    for (const doc of docs) {
      if (doc.pid) {
        try {
          await killTask(doc.pid);
        } catch (error) {
          this.logger.error(error);
        }
      }
    }

    await SubscriptionModel.update(
      { last_sync_state: 'FAILED', last_sync_phase: 'CANCELLED', last_sync_error: 'SUBSCRIPTION_CANCELLED' },
      { where: { id: ids, git_mode: 'MANAGED', last_sync_state: 'RUNNING' } },
    );
    await SubscriptionModel.update(
      { status: SubscriptionStatus.idle, pid: undefined },
      { where: { id: ids } },
    );
  }

  private async runSingle(subscriptionId: number) {
    const subscription = await this.getDb({ id: subscriptionId });
    if (subscription.status !== SubscriptionStatus.queued) {
      return;
    }

    const command = subscription.repository_id ? repositorySubscriptionCommand(subscription.id!) : formatCommand(subscription);

    this.scheduleService.runTask(command, this.taskCallbacks(subscription), {
      name: subscription.name,
      schedule: subscription.schedule,
      command,
      id: String(subscription.id),
      runOrigin: 'subscription',
    });
  }

  public async disabled(ids: number[]) {
    await SubscriptionModel.update({ is_disabled: 1 }, { where: { id: ids } });
    const docs = await SubscriptionModel.findAll({ where: { id: ids } });
    await this.setSshConfig();
    for (const doc of docs) {
      await this.handleTask(doc.get({ plain: true }), false);
    }
  }

  public async enabled(ids: number[]) {
    await SubscriptionModel.update({ is_disabled: 0 }, { where: { id: ids } });
    const docs = await SubscriptionModel.findAll({ where: { id: ids } });
    await this.setSshConfig();
    for (const doc of docs) {
      await this.handleTask(doc.get({ plain: true }));
    }
  }

  public async log(id: number, options: LogReadOptions = {}) {
    const doc = await this.getDb({ id });
    if (!doc || !doc.log_path) {
      return {
        content: '',
        offset: 0,
        nextOffset: 0,
        total: 0,
        truncated: false,
      };
    }

    const absolutePath = await handleLogPath(doc.log_path as string);
    return await readLogChunk(absolutePath, options);
  }

  public async logs(id: number) {
    const doc = await this.getDb({ id });
    if (!doc) {
      return [];
    }

    if (doc.log_path) {
      const relativeDir = path.dirname(`${doc.log_path}`);
      const dir = path.resolve(config.logPath, relativeDir);
      const _exist = await fileExist(dir);
      if (_exist) {
        let files = await fs.readdir(dir);
        return (
          await Promise.all(
            files.map(async (x) => ({
              filename: x,
              directory: relativeDir.replace(config.logPath, ''),
              time: (await fs.lstat(`${dir}/${x}`)).birthtimeMs,
            })),
          )
        ).sort((a, b) => b.time - a.time);
      }
    }
  }
}
