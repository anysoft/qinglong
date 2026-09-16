import { triggerTimezone } from '../shared/triggerTimezone';
import { randomUUID, timingSafeEqual } from 'crypto';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { TaskModel } from '../data/task';
import {
  TaskTriggerModel,
  CronTriggerModel,
  WebhookTriggerModel,
  GitUpdateTriggerModel,
  TriggerEventModel,
} from '../data/taskTrigger';
import {
  TriggerError,
  exactKeys,
  positiveTriggerId,
  cronNext,
  newWebhookSecret,
  secretDigest,
  relativeGlob,
} from '../shared/triggerDefinition';

export default class TaskTriggerService {
  constructor(private readonly now: () => Date = () => new Date()) {}
  async list(taskId: number) {
    positiveTriggerId(taskId);
    const triggers = await TaskTriggerModel.findAll({
      where: { task_id: taskId },
      order: [['id', 'ASC']],
    });
    const ids = triggers.map((t) => t.id);
    const [cron, webhook, git] = await Promise.all([
      CronTriggerModel.findAll({ where: { trigger_id: ids } }),
      WebhookTriggerModel.findAll({
        where: { trigger_id: ids },
        attributes: ['trigger_id', 'public_id'],
      }),
      GitUpdateTriggerModel.findAll({ where: { trigger_id: ids } }),
    ]);
    const configs = new Map(
      [...cron, ...webhook, ...git].map((c) => [
        c.trigger_id,
        c.get({ plain: true }),
      ]),
    );
    return triggers.map((t) => ({
      ...t.get({ plain: true }),
      config: configs.get(t.id),
    }));
  }
  async save(taskId: number, input: unknown, id?: number) {
    positiveTriggerId(taskId);
    if (id !== undefined) positiveTriggerId(id);
    exactKeys(input, ['type', 'enabled', 'config', 'expected_version']);
    if (
      !['CRON', 'WEBHOOK', 'GIT_UPDATE'].includes(input.type) ||
      (input.enabled !== undefined && typeof input.enabled !== 'boolean')
    )
      throw new TriggerError('TRIGGER_DEFINITION_INVALID');
    const config = input.config ?? {};
    let values: Record<string, unknown>, secret: string | undefined;
    if (input.type === 'CRON') {
      exactKeys(config, ['expression', 'timezone', 'misfire_policy']);
      const timezone =
          config.timezone === undefined || config.timezone === ''
            ? await triggerTimezone()
            : config.timezone,
        misfire = config.misfire_policy ?? 'SKIP';
      if (!['SKIP', 'FIRE_ONCE'].includes(misfire))
        throw new TriggerError('CRON_MISFIRE_INVALID');
      values = {
        expression: config.expression,
        timezone,
        misfire_policy: misfire,
        next_fire_at: cronNext(config.expression, timezone, this.now()),
      };
    } else if (input.type === 'WEBHOOK') {
      exactKeys(config, []);
      secret = id === undefined ? newWebhookSecret() : undefined;
      values = secret
        ? { public_id: randomUUID(), secret_hash: secretDigest(secret) }
        : {};
    } else {
      exactKeys(config, ['mode', 'path_filters', 'fire_on_initial']);
      if (
        !['ANY_CHANGE', 'SOURCE_CHANGE', 'PATH_FILTER'].includes(config.mode) ||
        !Array.isArray(config.path_filters ?? []) ||
        (config.path_filters?.length ?? 0) > 64 ||
        (config.fire_on_initial !== undefined &&
          typeof config.fire_on_initial !== 'boolean')
      )
        throw new TriggerError('GIT_TRIGGER_INVALID');
      const patterns = (config.path_filters ?? []).map(relativeGlob);
      if (config.mode === 'PATH_FILTER' && !patterns.length)
        throw new TriggerError('GIT_TRIGGER_FILTER_REQUIRED');
      values = {
        mode: config.mode,
        path_filters: patterns,
        fire_on_initial: config.fire_on_initial ?? false,
      };
    }
    const triggerId = await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        if (!(await TaskModel.findByPk(taskId, { transaction })))
          throw new TriggerError('TASK_NOT_FOUND', 404);
        let row =
          id === undefined
            ? null
            : await TaskTriggerModel.findOne({
                where: { id, task_id: taskId },
                transaction,
              });
        if (id !== undefined && !row)
          throw new TriggerError('TRIGGER_NOT_FOUND', 404);
        if (row) {
          if (input.expected_version !== row.version)
            throw new TriggerError('TRIGGER_VERSION_CONFLICT', 409);
          if (input.type !== row.type)
            throw new TriggerError('TRIGGER_TYPE_IMMUTABLE');
          await row.update(
            {
              enabled: input.enabled ?? row.enabled,
              origin: 'USER',
              version: row.version + 1,
            },
            { transaction },
          );
        } else
          row = await TaskTriggerModel.create(
            {
              task_id: taskId,
              type: input.type,
              enabled: input.enabled ?? true,
              origin: 'USER',
            },
            { transaction },
          );
        if (input.type === 'CRON') {
          const previous =
            id === undefined
              ? null
              : await CronTriggerModel.findByPk(id, { transaction });
          // v9 keeps a NOT NULL timestamp. enabled=false is the persisted
          // inactive state; freeze its dormant timestamp and exclude it in SQL.
          values.next_fire_at =
            !row.enabled && previous
              ? previous.next_fire_at
              : cronNext(
                  config.expression,
                  String(values.timezone),
                  this.now(),
                );
        }
        const model =
          input.type === 'CRON'
            ? CronTriggerModel
            : input.type === 'WEBHOOK'
            ? WebhookTriggerModel
            : GitUpdateTriggerModel;
        if (id === undefined)
          await (model as any).create(
            { ...values, trigger_id: row.id },
            { transaction },
          );
        else if (Object.keys(values).length)
          await (model as any).update(values, {
            where: { trigger_id: row.id },
            transaction,
          });
        return row.id;
      },
    );
    return {
      ...(await this.list(taskId)).find((t) => t.id === triggerId)!,
      ...(secret ? { secret } : {}),
    };
  }
  async remove(taskId: number, id: number, expectedVersion: number) {
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const row = await TaskTriggerModel.findOne({
          where: {
            id: positiveTriggerId(id),
            task_id: positiveTriggerId(taskId),
          },
          transaction,
        });
        if (!row) throw new TriggerError('TRIGGER_NOT_FOUND', 404);
        if (row.version !== expectedVersion)
          throw new TriggerError('TRIGGER_VERSION_CONFLICT', 409);
        // Discovery identity stays as a disabled USER tombstone to prevent recreation.
        if (row.discovery_key)
          await row.update(
            { enabled: false, origin: 'USER', version: row.version + 1 },
            { transaction },
          );
        else await row.destroy({ transaction });
      },
    );
  }
  async rotate(taskId: number, id: number, expectedVersion: number) {
    const secret = newWebhookSecret();
    await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const row = await TaskTriggerModel.findOne({
          where: {
            id: positiveTriggerId(id),
            task_id: positiveTriggerId(taskId),
            type: 'WEBHOOK',
          },
          transaction,
        });
        if (!row) throw new TriggerError('TRIGGER_NOT_FOUND', 404);
        if (row.version !== expectedVersion)
          throw new TriggerError('TRIGGER_VERSION_CONFLICT', 409);
        await WebhookTriggerModel.update(
          { secret_hash: secretDigest(secret) },
          { where: { trigger_id: id }, transaction },
        );
        await row.update({ version: row.version + 1 }, { transaction });
      },
    );
    return { secret };
  }
  async authenticate(publicId: string, authorization: string | undefined) {
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1];
    const row = /^[0-9a-f-]{36}$/.test(publicId)
      ? await WebhookTriggerModel.findOne({ where: { public_id: publicId } })
      : null;
    const actual = Buffer.from(secretDigest(token ?? ''), 'hex');
    const expected = Buffer.from(row?.secret_hash ?? '0'.repeat(64), 'hex');
    const valid = timingSafeEqual(actual, expected);
    if (!row || !token || !valid)
      throw new TriggerError('WEBHOOK_UNAUTHORIZED', 401);
    return row.trigger_id;
  }
  async events(taskId: number) {
    return TriggerEventModel.findAll({
      where: { task_id: positiveTriggerId(taskId) },
      limit: 20,
      order: [['id', 'DESC']],
    });
  }
}
