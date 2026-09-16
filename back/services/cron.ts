import { executionLauncher } from '../shared/executionLauncher';
import { randomUUID } from 'crypto';
import {
  withSchedulerMutation,
  schedulerRegistrationError,
} from '../shared/schedulerMutationLock';
import { Service, Inject } from 'typedi';
import winston from 'winston';
import config from '../config';
import {
  SchedulerProjection,
  SchedulerProjectionModel,
  CrontabStatus,
} from '../data/cron';
import { RunningInstanceModel, InstanceStatus } from '../data/runningInstance';
import { exec, execSync } from 'child_process';
import fs from 'fs/promises';
import CronExpressionParser from 'cron-parser';
import {
  getFileContentByName,
  fileExist,
  killTask,
  getUniqPath,
  safeJSONParse,
  isDemoEnv,
} from '../config/util';
import {
  Op,
  where,
  col as colFn,
  FindOptions,
  fn,
  Order,
  Transaction,
} from 'sequelize';
import { sequelize } from '../data';
import { TaskModel } from '../data/task';
import TaskExecutionSourceBridge from './taskExecutionSourceBridge';
import TaskResourceResolver from './taskResourceResolver';
import path from 'path';
import { TASK_PREFIX } from '../config/const';
import cronClient from '../schedule/client';
import taskLimit from '../shared/pLimit';
import { spawn } from 'cross-spawn';
import dayjs from 'dayjs';
import pickBy from 'lodash/pickBy';
import omit from 'lodash/omit';
import { writeFileWithLock } from '../shared/utils';
import { t } from '../shared/i18n';
import { ScheduleType } from '../interface/schedule';
import { logStreamManager } from '../shared/logStreamManager';
import { observeChildProcess, asError } from '../shared/childProcess';
import { isEmpty } from 'lodash';
import { LogReadOptions, readLogChunk } from '../shared/logReader';
import { resolveFileAccess } from '../shared/fileAccess';

@Service()
export default class CurrentTaskBridgeService {
  constructor(@Inject('logger') private logger: winston.Logger) {}

  /** Task definitions and their scheduler projection commit together. Scheduler
   * failures roll back SQLite, including Task-owned ENV/Config/Hooks cascades. */
  async mutateTaskDefinitions<T extends { id?: number } | null>(
    mutation: (transaction: Transaction) => Promise<T>,
  ): Promise<T> {
    return withSchedulerMutation(async () => {
      const previous = (await SchedulerProjectionModel.findAll()).map((row) =>
        row.get({ plain: true }),
      );
      let attempted: number[] = previous.map((row) => row.id!);
      const register = async (rows: SchedulerProjection[]) => {
        if (isDemoEnv()) return;
        await cronClient.addCron(
          rows
            .filter(
              (row) => row.isDisabled !== 1 && this.shouldUseCronClient(row),
            )
            .map((row) => ({
              name: row.name ?? '',
              id: String(row.id),
              schedule: row.schedule!,
              command: this.makeCommand(row),
              extra_schedules: row.extra_schedules ?? [],
            })),
        );
      };
      try {
        return await sequelize.transaction(
          { type: Transaction.TYPES.IMMEDIATE },
          async (transaction) => {
            const result = await mutation(transaction);
            if (
              result?.id &&
              (await TaskModel.findByPk(result.id, { transaction }))
            )
              await new TaskExecutionSourceBridge().refresh(
                result.id,
                transaction,
              );
            const rows = (
              await SchedulerProjectionModel.findAll({ transaction })
            ).map((row) => row.get({ plain: true }));
            const resources = new Map(
              (
                await new TaskResourceResolver().resolve(
                  rows.map((row) => row.id!),
                  transaction,
                )
              ).map((resource) => [resource.task.id, resource]),
            );
            for (const row of rows) {
              const resource = resources.get(row.id!);
              if (
                !resource?.task.enabled ||
                resource.readiness.status !== 'READY' ||
                !row.schedule
              )
                row.isDisabled = 1;
            }
            attempted = [
              ...new Set([...attempted, ...rows.map((row) => row.id!)]),
            ];
            if (!isDemoEnv() && previous.length)
              await cronClient.delCron(previous.map((row) => String(row.id)));
            await register(rows);
            await this.setCrontab(
              { data: rows, total: rows.length },
              true,
              transaction,
            );
            return result;
          },
        );
      } catch (error) {
        try {
          if (!isDemoEnv() && attempted.length)
            await cronClient.delCron(attempted.map(String));
          await register(previous);
          await this.setCrontab(
            { data: previous, total: previous.length },
            true,
          );
        } catch (recoveryError) {
          throw Object.assign(new Error('TASK_SCHEDULER_RECOVERY_REQUIRED'), {
            error_code: 'TASK_SCHEDULER_RECOVERY_REQUIRED',
            status: 503,
            cause: recoveryError,
          });
        }
        throw error;
      }
    });
  }

  private isNodeCron(cron: SchedulerProjection) {
    const { schedule, extra_schedules } = cron;
    if (Number(schedule?.split(/ +/).length) > 5 || extra_schedules?.length) {
      return true;
    }
    return false;
  }

  private get schedulerMode(): 'system' | 'node' {
    const env = process.env.QL_SCHEDULER;
    if (env === 'system') return 'system';
    if (env === 'node') return 'node';
    try {
      execSync('which crond', { stdio: 'ignore' });
      return 'system';
    } catch {
      return 'node';
    }
  }

  private shouldUseCronClient(cron: SchedulerProjection): boolean {
    if (this.schedulerMode === 'node') {
      return !this.isSpecialSchedule(cron.schedule);
    }
    return this.isNodeCron(cron) && !this.isSpecialSchedule(cron.schedule);
  }

  private isOnceSchedule(schedule?: string) {
    return schedule?.startsWith(ScheduleType.ONCE);
  }

  private isBootSchedule(schedule?: string) {
    return schedule?.startsWith(ScheduleType.BOOT);
  }

  private isSpecialSchedule(schedule?: string) {
    return this.isOnceSchedule(schedule) || this.isBootSchedule(schedule);
  }

  private async getLogName(cron: SchedulerProjection) {
    const { log_name, command, id } = cron;
    if (log_name === '/dev/null') {
      return log_name;
    }
    let uniqPath = await getUniqPath(command, `${id}`);
    if (log_name) {
      const normalizedLogName = log_name.startsWith('/')
        ? log_name
        : path.join(config.logPath, log_name);
      if (normalizedLogName.startsWith(config.logPath)) {
        uniqPath = log_name;
      }
    }
    const logDirPath = path.resolve(config.logPath, `${uniqPath}`);
    await fs.mkdir(logDirPath, { recursive: true });
    return uniqPath;
  }

  public async create(
    payload: SchedulerProjection,
  ): Promise<SchedulerProjection> {
    return withSchedulerMutation(async () => {
      const tab = new SchedulerProjection(payload);
      tab.saved = false;
      tab.log_name = await this.getLogName(tab);
      const doc = await this.insert(tab);

      if (isDemoEnv()) {
        return doc;
      }

      if (this.shouldUseCronClient(doc)) {
        try {
          await cronClient.addCron([
            {
              name: doc.name || '',
              id: String(doc.id),
              schedule: doc.schedule!,
              command: this.makeCommand(doc),
              extra_schedules: doc.extra_schedules || [],
            },
          ]);
        } catch (error: any) {
          // gRPC 注册失败时回滚 DB 记录，避免产生"僵尸任务"
          // （DB 和 crontab.list 有记录但调度器永远不会执行）
          await SchedulerProjectionModel.destroy({ where: { id: doc.id } });
          this.logger.error(
            '[crontab] Failed to register cron job in scheduler, task creation rolled back:',
            error?.message || error,
          );
          throw schedulerRegistrationError(
            `${t('调度器注册失败，任务创建已回滚')}: ${
              (error as any)?.details || error?.message
            }`,
            error,
          );
        }
      }

      await this.setCrontab();
      return doc;
    });
  }

  // Discovery uses a DB projection under the scheduler mutation lock.
  // Source identity survives definition updates; publication compensates files, DB and scheduler.
  public async publishSubscription(
    discover: () => Promise<{
      adds: SchedulerProjection[];
      drops: number[];
      subscriptionId: number;
      updates: Array<
        Partial<
          Pick<
            SchedulerProjection,
            'id' | 'name' | 'command' | 'schedule' | 'discovery_definition'
          >
        >
      >;
      checkpoint?: (tasks: SchedulerProjection[]) => Promise<void>;
      notify?: () => Promise<void>;
      publish: () => Promise<void>;
      rollback: () => Promise<void>;
      cleanup: () => Promise<void>;
      definitions: {
        add: (
          draft: SchedulerProjection,
        ) => Promise<{ id: number; isDisabled: number }>;
        update: (draft: any) => Promise<void>;
        remove: (ids: number[]) => Promise<unknown>;
        rollback: () => Promise<unknown>;
      };
    }>,
    publishing: () => Promise<void>,
  ) {
    return withSchedulerMutation(async () => {
      const plan = await discover();
      const previous = (
        await SchedulerProjectionModel.findAll({
          where: { id: [...plan.drops, ...plan.updates.map((x) => x.id!)] },
        })
      ).map((x) => x.get({ plain: true }));
      if (
        previous.some(
          (row) => row.sub_id !== plan.subscriptionId || !row.discovery_key,
        ) ||
        plan.adds.some(
          (row) => row.sub_id !== plan.subscriptionId || !row.discovery_key,
        )
      ) {
        await plan.cleanup();
        throw Object.assign(new Error('INVALID_DISCOVERY_PLAN'), {
          error_code: 'INVALID_DISCOVERY_PLAN',
        });
      }
      const added: SchedulerProjection[] = [];
      let started = false,
        recovered = true;
      const register = (rows: SchedulerProjection[]) =>
        cronClient.addCron(
          rows
            .filter((x) => x.isDisabled !== 1 && this.shouldUseCronClient(x))
            .map((doc) => ({
              name: doc.name || '',
              id: String(doc.id),
              schedule: doc.schedule!,
              command: this.makeCommand(doc),
              extra_schedules: doc.extra_schedules || [],
            })),
        );
      try {
        for (const tab of [
          ...plan.adds,
          ...plan.updates.map((update) => ({
            ...previous.find((x) => x.id === update.id),
            ...update,
          })),
        ]) {
          if (
            !tab.schedule ||
            !CronExpressionParser.parse(tab.schedule).hasNext()
          )
            throw new Error('Invalid discovered schedule');
        }
        await plan.checkpoint?.(previous);
        await publishing();
        started = true;
        await plan.publish();
        // Deletes and creates reuse the existing scheduler protocol. Compensation
        // restores original IDs instead of recreating user Tasks with new IDs.
        if (previous.length)
          await cronClient.delCron(previous.map((x) => String(x.id)));
        for (const input of plan.adds) {
          const tab = new SchedulerProjection(input);
          const definition = await plan.definitions.add(input);
          tab.id = definition.id;
          tab.isDisabled = definition.isDisabled as 0 | 1;
          tab.saved = false;
          tab.log_name = await this.getLogName(tab);
          const inserted = await this.insert(tab);
          await new TaskExecutionSourceBridge().refresh(definition.id);
          added.push(
            (await SchedulerProjectionModel.findByPk(inserted.id!))!.get({
              plain: true,
            }),
          );
        }
        for (const update of plan.updates) {
          await plan.definitions.update(update);
          await SchedulerProjectionModel.update(update, {
            where: { id: update.id },
          });
          await new TaskExecutionSourceBridge().refresh(update.id!);
        }
        const updated = (
          await SchedulerProjectionModel.findAll({
            where: { id: plan.updates.map((x) => x.id!) },
          })
        ).map((row) => row.get({ plain: true }));
        await register([...added, ...updated]);
        const projection = (await SchedulerProjectionModel.findAll())
          .map((row) => row.get({ plain: true }))
          .filter((row) => !plan.drops.includes(row.id!));
        await this.setCrontab(
          { data: projection, total: projection.length },
          true,
        );
        // Final fallible publication operation: retain Task-owned ENV/Config/Hooks
        // until filesystem and both schedulers have accepted the new projection.
        await plan.definitions.remove(plan.drops);
        try {
          await plan.notify?.();
        } catch {
          this.logger.warn('Managed subscription notification failed');
        }
      } catch (error) {
        if (started) {
          try {
            await plan.rollback();
            await plan.definitions.rollback();
            await SchedulerProjectionModel.destroy({
              where: { id: added.map((x) => x.id!) },
            });
            for (const row of previous) {
              if (!plan.drops.includes(row.id!))
                await SchedulerProjectionModel.update(
                  {
                    name: row.name,
                    command: row.command,
                    schedule: row.schedule,
                    discovery_definition: row.discovery_definition,
                  },
                  { where: { id: row.id } },
                );
            }
            if (added.length)
              await cronClient.delCron(added.map((x) => String(x.id)));
            await register(previous);
            await this.setCrontab(undefined, true);
          } catch (recoveryError) {
            recovered = false;
            this.logger.error(
              'Managed subscription publication rollback requires recovery',
            );
            throw Object.assign(new Error('SUBSCRIPTION_RECOVERY_REQUIRED'), {
              error_code: 'SUBSCRIPTION_RECOVERY_REQUIRED',
              cause: recoveryError,
            });
          }
        }
        throw error;
      } finally {
        // Keep the previous files available for manual recovery if compensation fails.
        if (recovered)
          await plan
            .cleanup()
            .catch(() =>
              this.logger.warn('Managed subscription staging cleanup failed'),
            );
      }
    });
  }

  public async insert(
    payload: SchedulerProjection,
  ): Promise<SchedulerProjection> {
    return await SchedulerProjectionModel.create(payload, { returning: true });
  }

  public async update(
    payload: Partial<SchedulerProjection>,
  ): Promise<SchedulerProjection> {
    return withSchedulerMutation(async () => {
      const doc = await this.getDb({ id: payload.id });
      const tab = new SchedulerProjection({ ...doc, ...payload });
      tab.saved = false;
      tab.log_name = await this.getLogName(tab);
      if (doc.isDisabled === 1 || isDemoEnv()) {
        return await this.updateDb(tab);
      }

      // Keep the DB snapshot unchanged if deletion has an uncertain outcome.
      // Recovery uses that snapshot after this mutation releases its lock.
      await cronClient.delCron([String(doc.id)]);
      const newDoc = await this.updateDb(tab);

      if (this.shouldUseCronClient(newDoc)) {
        try {
          await cronClient.addCron([
            {
              name: doc.name || '',
              id: String(newDoc.id),
              schedule: newDoc.schedule!,
              command: this.makeCommand(newDoc),
              extra_schedules: newDoc.extra_schedules || [],
            },
          ]);
        } catch (error: any) {
          // gRPC 注册新任务失败 → 回滚 DB 到旧数据，并尝试恢复旧调度注册
          await SchedulerProjectionModel.update(omit(doc, ['queued_token']), {
            where: { id: doc.id },
          });
          if (this.shouldUseCronClient(doc)) {
            try {
              await cronClient.addCron([
                {
                  name: doc.name || '',
                  id: String(doc.id),
                  schedule: doc.schedule!,
                  command: this.makeCommand(doc),
                  extra_schedules: doc.extra_schedules || [],
                },
              ]);
            } catch (_recoveryError: any) {
              this.logger.warn(
                '[crontab] Failed to restore old cron job in scheduler after rollback:',
                _recoveryError?.message || _recoveryError,
              );
            }
          }
          this.logger.error(
            '[crontab] Failed to register updated cron job in scheduler, update rolled back:',
            error?.message || error,
          );
          throw schedulerRegistrationError(
            `${t('调度器注册失败，任务更新已回滚')}: ${
              (error as any)?.details || error?.message
            }`,
            error,
          );
        }
      }

      await this.setCrontab();
      return newDoc;
    });
  }

  public async updateDb(
    payload: SchedulerProjection,
  ): Promise<SchedulerProjection> {
    await SchedulerProjectionModel.update(payload, {
      where: { id: payload.id },
    });
    return await this.getDb({ id: payload.id });
  }

  public async status({
    ids,
    status,
    pid,
    log_path,
    last_running_time = 0,
    last_execution_time = 0,
    exit_code,
  }: {
    ids: number[];
    status: CrontabStatus;
    pid: number;
    log_path: string;
    last_running_time: number;
    last_execution_time: number;
    exit_code?: number;
  }) {
    let options: any = {
      status,
      pid,
      log_path,
      last_execution_time,
    };
    if (last_running_time > 0) {
      options.last_running_time = last_running_time;
    }

    for (const id of ids) {
      let cron;
      try {
        cron = await this.getDb({ id });
      } catch (err) {}
      if (!cron) {
        continue;
      }
      if (status === CrontabStatus.idle && log_path !== cron.log_path) {
        options = omit(options, ['status', 'log_path', 'pid']);
      }

      // Manage RunningInstance records for status transitions from shell scripts
      if (status === CrontabStatus.running) {
        // Create a new running instance record
        await RunningInstanceModel.create({
          cron_id: id,
          pid: pid || undefined,
          log_path: log_path || undefined,
          started_at: last_execution_time || dayjs().unix(),
          status: InstanceStatus.running,
        });
      } else if (status === CrontabStatus.idle) {
        // Mark the matching running instance as finished
        const finishedAt = dayjs().unix();
        const instanceStatus =
          exit_code !== undefined && exit_code !== null && exit_code !== 0
            ? InstanceStatus.error
            : InstanceStatus.finished;
        await RunningInstanceModel.update(
          {
            finished_at: finishedAt,
            status: instanceStatus,
            exit_code: exit_code ?? undefined,
          },
          {
            where: {
              cron_id: id,
              pid: pid || undefined,
              status: InstanceStatus.running,
            },
          },
        );
      }

      await SchedulerProjectionModel.update(
        { ...pickBy(options, (v) => v === 0 || !!v) },
        { where: { id } },
      );
    }
  }

  public async remove(ids: number[]) {
    return withSchedulerMutation(async () => {
      await cronClient.delCron(ids.map(String));
      await SchedulerProjectionModel.destroy({ where: { id: ids } });
      await this.setCrontab();
    });
  }

  public async pin(ids: number[]) {
    await SchedulerProjectionModel.update(
      { isPinned: 1 },
      { where: { id: ids } },
    );
  }

  public async unPin(ids: number[]) {
    await SchedulerProjectionModel.update(
      { isPinned: 0 },
      { where: { id: ids } },
    );
  }

  public async addLabels(ids: string[], labels: string[]) {
    const docs = await SchedulerProjectionModel.findAll({ where: { id: ids } });
    for (const doc of docs) {
      await SchedulerProjectionModel.update(
        {
          labels: Array.from(new Set((doc.labels || []).concat(labels))),
        },
        { where: { id: doc.id } },
      );
    }
  }

  public async removeLabels(ids: string[], labels: string[]) {
    const docs = await SchedulerProjectionModel.findAll({ where: { id: ids } });
    for (const doc of docs) {
      await SchedulerProjectionModel.update(
        {
          labels: (doc.labels || []).filter((label) => !labels.includes(label)),
        },
        { where: { id: doc.id } },
      );
    }
  }

  private formatViewQuery(query: any, viewQuery: any) {
    if (viewQuery.filters && viewQuery.filters.length > 0) {
      const primaryOperate = viewQuery.filterRelation === 'or' ? Op.or : Op.and;
      if (!query[primaryOperate]) {
        query[primaryOperate] = [];
      }
      for (const col of viewQuery.filters) {
        const { property, value, operation } = col;
        let q: any = {};
        let operate2: any = null;
        let operate: any = null;
        switch (operation) {
          case 'Reg':
            operate = Op.like;
            operate2 = Op.or;
            break;
          case 'NotReg':
            operate = Op.notLike;
            operate2 = Op.and;
            break;
          case 'In':
            if (
              property === 'status' &&
              !value.includes(CrontabStatus.disabled)
            ) {
              q[Op.and] = [
                { [property]: Array.isArray(value) ? value : [value] },
                { isDisabled: 0 },
              ];
            } else {
              q[Op.or] = [
                {
                  [property]: Array.isArray(value) ? value : [value],
                },
                property === 'status' && value.includes(CrontabStatus.disabled)
                  ? { isDisabled: 1 }
                  : {},
              ];
            }
            break;
          case 'Nin':
            q[Op.and] = [
              {
                [Op.or]: [
                  {
                    [property]: {
                      [Op.notIn]: Array.isArray(value) ? value : [value],
                    },
                  },
                  {
                    [property]: { [Op.is]: null },
                  },
                ],
              },
              property === 'status' && value.includes(2)
                ? { isDisabled: { [Op.ne]: 1 } }
                : {},
            ];
            break;
          default:
            break;
        }
        if (operate && operate2) {
          q[property] = {
            [Op.or]: [
              {
                [operate2]: [
                  { [operate]: `%${value}%` },
                  { [operate]: `%${encodeURI(value)}%` },
                ],
              },
              {
                [operate2]: [
                  where(colFn(property), operate, `%${value}%`),
                  where(colFn(property), operate, `%${encodeURI(value)}%`),
                ],
              },
            ],
          };
        }
        query[primaryOperate].push(q);
      }
    }
  }

  private formatSearchText(query: any, searchText: string | undefined) {
    if (searchText) {
      if (!query[Op.and]) {
        query[Op.and] = [];
      }
      let q: any = {};
      const textArray = searchText.split(':');
      switch (textArray[0]) {
        case 'name':
        case 'command':
        case 'schedule':
        case 'label':
          const column = textArray[0] === 'label' ? 'labels' : textArray[0];
          q[column] = {
            [Op.or]: [
              { [Op.like]: `%${textArray[1]}%` },
              { [Op.like]: `%${encodeURI(textArray[1])}%` },
            ],
          };
          break;
        default:
          const reg = {
            [Op.or]: [
              { [Op.like]: `%${searchText}%` },
              { [Op.like]: `%${encodeURI(searchText)}%` },
            ],
          };
          q[Op.or] = [
            {
              name: reg,
            },
            {
              command: reg,
            },
            {
              schedule: reg,
            },
            {
              labels: reg,
            },
          ];
          break;
      }
      query[Op.and].push(q);
    }
  }

  private formatFilterQuery(query: any, filterQuery: any) {
    if (!isEmpty(filterQuery)) {
      if (!query[Op.and]) {
        query[Op.and] = [];
      }
      const filterKeys: any = Object.keys(filterQuery);
      for (const key of filterKeys) {
        let q: any = {};
        if (!filterQuery[key]) continue;
        if (key === 'status') {
          if (filterQuery[key].includes(CrontabStatus.disabled)) {
            q = { [Op.or]: [{ [key]: filterQuery[key] }, { isDisabled: 1 }] };
          } else {
            q = { [Op.and]: [{ [key]: filterQuery[key] }, { isDisabled: 0 }] };
          }
        } else {
          q[key] = filterQuery[key];
        }
        query[Op.and].push(q);
      }
    }
  }

  private formatViewSort(order: string[][], viewQuery: any) {
    if (viewQuery.sorts && viewQuery.sorts.length > 0) {
      for (const { property, type } of viewQuery.sorts) {
        order.unshift([property, type]);
      }
    }
  }

  public async find({
    log_path,
  }: {
    log_path: string;
  }): Promise<SchedulerProjection | undefined> {
    try {
      const result = await SchedulerProjectionModel.findOne({
        where: { log_path },
      });
      return result?.get({ plain: true });
    } catch (error) {
      throw error;
    }
  }

  public async crontabs(params?: {
    searchValue: string;
    page: string;
    size: string;
    sorter: string;
    filters: string;
    queryString: string;
  }): Promise<{ data: SchedulerProjection[]; total: number }> {
    const searchText = params?.searchValue;
    const page = Number(params?.page || '0');
    const size = Number(params?.size || '0');
    const viewQuery = safeJSONParse(params?.queryString);
    const filterQuery = safeJSONParse(params?.filters);
    const sorterQuery = safeJSONParse(params?.sorter);

    let query: any = {};
    let order = [
      ['isPinned', 'DESC'],
      ['isDisabled', 'ASC'],
      ['status', 'ASC'],
      ['createdAt', 'DESC'],
    ];

    this.formatViewQuery(query, viewQuery);
    this.formatSearchText(query, searchText);
    this.formatFilterQuery(query, filterQuery);
    this.formatViewSort(order, viewQuery);

    if (sorterQuery) {
      const { field, type } = sorterQuery;
      if (field && type) {
        order.unshift([field, type]);
      }
    }
    let condition: FindOptions<SchedulerProjection> = {
      where: query,
      order: order as Order,
    };
    if (page && size) {
      condition.offset = (page - 1) * size;
      condition.limit = size;
    }
    try {
      const result = await SchedulerProjectionModel.findAll(condition);
      const count = await SchedulerProjectionModel.count({ where: query });
      return { data: result.map((x) => x.get({ plain: true })), total: count };
    } catch (error) {
      throw error;
    }
  }

  public async getDb(
    query: FindOptions<SchedulerProjection>['where'],
  ): Promise<SchedulerProjection> {
    const doc: any = await SchedulerProjectionModel.findOne({
      where: { ...query },
    });
    if (!doc) {
      throw new Error(`Cron ${JSON.stringify(query)} not found`);
    }
    return doc.get({ plain: true });
  }

  public async run(ids: number[]) {
    const { executionService } = await import('./executionService');
    const runs = [];
    for (const id of ids) runs.push(await executionService.submit(id, 'API'));
    return runs;
  }

  public async stop(ids: number[]) {
    const { executionService } = await import('./executionService');
    for (const id of ids) await executionService.cancelTask(id);
  }

  public async stopInstance(instanceId: number) {
    // Stored PIDs cannot establish ownership after a restart or PID reuse.
    return { code: 409, message: 'Use TaskRun cancellation by run ID' };
  }

  private async runSingle(
    cronId: number,
    expectedToken?: string,
  ): Promise<number | void> {
    return taskLimit.manualRunWithCronLimit(async () => {
      let absolutePath: string | undefined;
      let logPath: string | undefined;
      let queuedLogPath: string | null | undefined;
      let queuedToken: string | null = null;
      let claimed = false;
      try {
        const cron = await this.getDb({ id: cronId });
        if (
          cron.status !== CrontabStatus.queued ||
          (expectedToken !== undefined && cron.queued_token !== expectedToken)
        )
          return;
        queuedToken = cron.queued_token ?? null;
        queuedLogPath = cron.log_path ?? null;
        const { id, command, log_name } = cron;
        const uniqPath =
          log_name === '/dev/null' || !log_name
            ? await getUniqPath(command, `${id}`)
            : log_name;
        const logTime = dayjs().format('YYYY-MM-DD-HH-mm-ss-SSS');
        logPath = `${uniqPath}/${logTime}.log`;
        absolutePath = resolveFileAccess(config.logPath, [logPath]);
        if (!absolutePath)
          throw new Error('Log path is outside the log directory');
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        const outputPath = absolutePath;
        const cp = spawn(
          `real_log_path=${logPath} no_delay=true ${this.makeCommand(
            cron,
            true,
          )}`,
          { shell: '/bin/bash' },
        );
        // Install observers before the first await: very short children may already exit.
        const { completed } = observeChildProcess(cp, {
          onStart: async () => {
            try {
              const [count] = await SchedulerProjectionModel.update(
                {
                  status: CrontabStatus.running,
                  pid: cp.pid,
                  log_path: logPath,
                },
                {
                  where: {
                    id,
                    status: CrontabStatus.queued,
                    [Op.and]: [
                      where(colFn('queued_token'), { [Op.eq]: queuedToken }),
                      where(colFn('log_path'), { [Op.eq]: queuedLogPath }),
                    ],
                  },
                },
              );
              if (count !== 1)
                throw new Error(
                  'Task was stopped or superseded before startup',
                );
              claimed = true;
            } catch (error) {
              if (cp.pid) await killTask(cp.pid, true);
              throw error;
            }
          },
          onStdout: (message) => logStreamManager.write(outputPath, message),
          onStderr: (message) => logStreamManager.write(outputPath, message),
        });
        const result = await completed;
        if (result.error) {
          this.logger.error(
            '[panel][执行任务失败] 任务ID: %s, 错误: %s',
            id,
            result.error.message,
          );
        }
        this.logger.info(
          '[panel][执行任务结束] 任务ID: %s, 退出码: %j',
          id,
          result.code,
        );
        return { ...cron, pid: cp.pid, ...result } as any;
      } catch (error) {
        this.logger.error(
          '[panel][创建任务失败] 任务ID: %s, 错误: %s',
          cronId,
          asError(error).message,
        );
      } finally {
        try {
          if (absolutePath) await logStreamManager.closeStream(absolutePath);
        } catch (error) {
          this.logger.error(
            '[panel][关闭任务日志失败] %s',
            asError(error).message,
          );
        }
        try {
          // Do not overwrite a newer run's state or its script-reported exit code.
          await SchedulerProjectionModel.update(
            {
              status: CrontabStatus.idle,
              pid: null,
              queued_token: null,
            } as any,
            {
              where: {
                id: cronId,
                [Op.and]: where(colFn('queued_token'), {
                  [Op.eq]: queuedToken,
                }),
                [Op.or]: [
                  ...(queuedLogPath !== undefined && !claimed
                    ? [
                        {
                          status: CrontabStatus.queued,
                          [Op.and]: where(colFn('log_path'), {
                            [Op.eq]: queuedLogPath,
                          }),
                        },
                      ]
                    : []),
                  ...(claimed && logPath
                    ? [{ log_path: logPath, status: CrontabStatus.running }]
                    : []),
                ],
              },
            },
          );
        } catch (error) {
          this.logger.error(
            '[panel][清理任务状态失败] %s',
            asError(error).message,
          );
        }
      }
    });
  }

  public async disabled(ids: number[]) {
    return withSchedulerMutation(async () => {
      await cronClient.delCron(ids.map(String));
      await SchedulerProjectionModel.update(
        { isDisabled: 1 },
        { where: { id: ids } },
      );
      await this.setCrontab();
    });
  }

  public async enabled(ids: number[]) {
    return withSchedulerMutation(async () => {
      await SchedulerProjectionModel.update(
        { isDisabled: 0 },
        { where: { id: ids } },
      );
      const docs = await SchedulerProjectionModel.findAll({
        where: { id: ids },
      });
      const crons = docs
        .filter((x) => this.shouldUseCronClient(x))
        .map((doc) => ({
          name: doc.name || '',
          id: String(doc.id),
          schedule: doc.schedule!,
          command: this.makeCommand(doc),
          extra_schedules: doc.extra_schedules || [],
        }));

      if (isDemoEnv()) {
        return;
      }

      try {
        await cronClient.addCron(crons);
      } catch (error: any) {
        // gRPC 注册失败 → 回滚启用状态，避免 DB 显示已启用但调度器未注册
        await SchedulerProjectionModel.update(
          { isDisabled: 1 },
          { where: { id: ids } },
        );
        this.logger.error(
          '[crontab] Failed to register cron job in scheduler, enable rolled back:',
          error?.message || error,
        );
        throw schedulerRegistrationError(
          `${t('调度器注册失败，任务启用已回滚')}: ${
            (error as any)?.details || error?.message
          }`,
          error,
        );
      }
      await this.setCrontab();
    });
  }

  public async log(
    id: number,
    options: LogReadOptions = {},
  ): Promise<{
    content: string;
    status: string;
    offset: number;
    nextOffset: number;
    total: number;
    truncated: boolean;
  }> {
    const doc = await this.getDb({ id });
    if (!doc) {
      return {
        content: '',
        status: 'empty',
        offset: 0,
        nextOffset: 0,
        total: 0,
        truncated: false,
      };
    }
    if (doc.log_name === '/dev/null') {
      return {
        content: t('日志设置为忽略'),
        status: 'ignored',
        offset: 0,
        nextOffset: 0,
        total: 0,
        truncated: false,
      };
    }
    const absolutePath = path.resolve(config.logPath, `${doc.log_path}`);
    const logFileExist = doc.log_path && (await fileExist(absolutePath));
    if (logFileExist) {
      const chunk = await readLogChunk(`${absolutePath}`, options);
      const isRunning =
        typeof doc.status === 'number' &&
        [CrontabStatus.running, CrontabStatus.queued].includes(doc.status);
      return {
        ...chunk,
        status: isRunning ? 'running' : 'completed',
      };
    } else {
      const status =
        typeof doc.status === 'number' &&
        [CrontabStatus.queued, CrontabStatus.running].includes(doc.status)
          ? 'running'
          : 'notFound';
      return {
        content: status === 'running' ? t('运行中...') : t('日志不存在...'),
        status,
        offset: 0,
        nextOffset: 0,
        total: 0,
        truncated: false,
      };
    }
  }

  public async logs(id: number) {
    const doc = await this.getDb({ id });
    if (!doc || !doc.log_path) {
      return [];
    }

    const relativeDir = path.dirname(`${doc.log_path}`);
    const dir = path.resolve(config.logPath, relativeDir);
    const dirExist = await fileExist(dir);
    if (dirExist) {
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
    } else {
      return [];
    }
  }

  private makeCommand(tab: SchedulerProjection, realTime?: boolean) {
    return executionLauncher(tab.id!);
  }

  private async setCrontab(
    data?: { data: SchedulerProjection[]; total: number },
    strict = false,
    transaction?: Transaction,
  ) {
    const tabs = data ?? (await this.crontabs());
    var crontab_string = '';
    tabs.data.forEach((tab) => {
      if (
        tab.isDisabled === 1 ||
        this.isNodeCron(tab) ||
        this.isSpecialSchedule(tab.schedule)
      ) {
        crontab_string += '# ';
        crontab_string += tab.schedule;
        crontab_string += ' ';
        crontab_string += this.makeCommand(tab).replace(/%/g, '\\%');
        crontab_string += '\n';
      } else {
        crontab_string += tab.schedule;
        crontab_string += ' ';
        crontab_string += this.makeCommand(tab).replace(/%/g, '\\%');
        crontab_string += '\n';
      }
    });

    await writeFileWithLock(config.crontabFile, crontab_string);

    if (this.schedulerMode === 'system') {
      try {
        execSync(`crontab ${config.crontabFile}`);
      } catch (error: any) {
        const errorMsg = error.message || String(error);
        this.logger.error(
          '[crontab] Failed to update system crontab:',
          errorMsg,
        );
        if (strict) throw error;
      }
    }

    await SchedulerProjectionModel.update(
      { saved: true },
      { where: {}, transaction },
    );
  }

  public async autosave_crontab(requireScheduler = false) {
    return withSchedulerMutation(async () => {
      const tabs = await this.crontabs();
      const readiness = new Map(
        (
          await new TaskResourceResolver().resolve(
            tabs.data.map((row) => row.id!),
          )
        ).map((resource) => [resource.task.id, resource]),
      );
      for (const row of tabs.data) {
        const resource = readiness.get(row.id!);
        if (!resource?.task.enabled || resource.readiness.status !== 'READY')
          row.isDisabled = 1;
      }
      const regularCrons = tabs.data
        .filter((x) => x.isDisabled !== 1 && this.shouldUseCronClient(x))
        .map((doc) => ({
          name: doc.name || '',
          id: String(doc.id),
          schedule: doc.schedule!,
          command: this.makeCommand(doc),
          extra_schedules: doc.extra_schedules || [],
        }));

      if (isDemoEnv()) {
        await writeFileWithLock(config.crontabFile, '');
        return;
      }

      // 先同步 crontab.list 与系统 crontab，确保其始终反映数据库真实状态。
      // gRPC 调度注册为尽力而为：失败时不阻断文件同步，调度器重启后会重新注册。
      // 这避免了因调度器短暂不可用导致 crontab.list 与数据库脱节。
      await this.setCrontab(tabs);
      try {
        await cronClient.addCron(regularCrons, requireScheduler);
      } catch (error: any) {
        this.logger.warn(
          '[crontab] Failed to register cron job in scheduler:',
          error?.message || error,
        );
        if (requireScheduler) throw error;
      }
    });
  }

  public async bootTask() {
    const tabs = await this.crontabs();
    const readiness = new Map(
      (
        await new TaskResourceResolver().resolve(
          tabs.data.map((row) => row.id!),
        )
      ).map((resource) => [resource.task.id, resource]),
    );
    const bootTasks = tabs.data.filter(
      (x) =>
        !x.isDisabled &&
        readiness.get(x.id!)?.task.enabled &&
        readiness.get(x.id!)?.readiness.status === 'READY' &&
        this.isBootSchedule(x.schedule),
    );
    if (bootTasks.length > 0) {
      await this.run(bootTasks.map((task) => task.id!));
    }
  }
}
