import { validateNotificationConfig } from '../shared/notificationConfig';
import { randomUUID } from 'crypto';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { ExecutionError } from '../shared/execution';
import { decodeJson, positiveId, selectRows } from './runObservability';
import {
  notificationTransport,
  notificationUrl,
} from './notificationTransport';

export const channelProviders = [
  'WEBHOOK',
  'gotify',
  'goCqHttpBot',
  'serverChan',
  'pushDeer',
  'chat',
  'bark',
  'telegramBot',
  'dingtalkBot',
  'weWorkBot',
  'weWorkApp',
  'aibotk',
  'iGot',
  'pushPlus',
  'wePlusBot',
  'email',
  'pushMe',
  'webhook',
  'lark',
  'chronocat',
  'ntfy',
  'wxPusherBot',
  'wxPusherSpt',
  'openiLink',
  'wpush',
];
const flags = [
  'enabled',
  'notify_success',
  'notify_failure',
  'notify_timeout',
  'notify_interrupted',
  'notify_cancelled',
  'notify_recovery',
];
function strict(value: any, keys: string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new ExecutionError('NOTIFICATION_INPUT_INVALID', 400);
}
function secrets(value: any) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Buffer.byteLength(JSON.stringify(value)) > 32768 ||
    Object.values(value).some(
      (v) =>
        typeof v !== 'string' &&
        typeof v !== 'number' &&
        typeof v !== 'boolean',
    )
  )
    throw new ExecutionError('CHANNEL_SECRET_INVALID', 400);
  return value;
}
export default class NotificationChannels {
  async list() {
    return selectRows(
      'SELECT id,name,type,enabled,is_default,version,non_secret_config,secret IS NOT NULL AS secret_configured,archived,created_at,updated_at FROM NotificationChannels ORDER BY id DESC',
    );
  }
  async get(id: number) {
    const [row] = await selectRows(
      'SELECT id,name,type,enabled,is_default,version,non_secret_config,secret IS NOT NULL AS secret_configured,archived,created_at,updated_at FROM NotificationChannels WHERE id= :id',
      { id },
    );
    if (!row) throw new ExecutionError('CHANNEL_NOT_FOUND', 404);
    return { ...row, non_secret_config: decodeJson(row.non_secret_config) };
  }
  async save(body: any, id?: number) {
    strict(body, [
      'name',
      'type',
      'enabled',
      'is_default',
      'expected_version',
      'secret_action',
      'secret',
    ]);
    if (
      typeof body.name !== 'string' ||
      !body.name.trim() ||
      body.name.length > 200 ||
      !channelProviders.includes(body.type)
    )
      throw new ExecutionError('CHANNEL_INPUT_INVALID', 400);
    for (const key of ['enabled', 'is_default'])
      if (body[key] !== undefined && typeof body[key] !== 'boolean')
        throw new ExecutionError('CHANNEL_INPUT_INVALID', 400);
    const action = body.secret_action ?? (id ? 'KEEP' : 'REPLACE');
    if (
      !['KEEP', 'REPLACE', 'DELETE'].includes(action) ||
      (action !== 'REPLACE' && body.secret !== undefined)
    )
      throw new ExecutionError('CHANNEL_SECRET_ACTION_INVALID', 400);
    if (action === 'REPLACE') {
      secrets(body.secret);
      validateNotificationConfig(body.type, body.secret);
      if (body.type === 'WEBHOOK') {
        strict(body.secret, ['url', 'authorization']);
        notificationUrl(body.secret.url);
      }
    }
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const rows = id
          ? ((await sequelize.query<any>(
              'SELECT * FROM NotificationChannels WHERE id= :id',
              { replacements: { id }, type: 'SELECT' as any, transaction },
            )) as any[])
          : [];
        const old = rows[0];
        if (id && (!old || old.archived))
          throw new ExecutionError('CHANNEL_NOT_FOUND', 404);
        if (old && old.version !== body.expected_version)
          throw new ExecutionError('CHANNEL_VERSION_CONFLICT', 409);
        if (old && old.type !== body.type && action === 'KEEP')
          throw new ExecutionError('CHANNEL_SECRET_REPLACE_REQUIRED', 400);
        const values = {
          id,
          name: body.name.trim(),
          type: body.type,
          enabled: body.enabled ?? true,
          is_default: body.is_default ?? false,
          secret:
            action === 'KEEP'
              ? old?.secret ?? null
              : action === 'DELETE'
              ? null
              : JSON.stringify(body.secret),
        };
        if (id)
          await sequelize.query(
            'UPDATE NotificationChannels SET name= :name,type= :type,enabled= :enabled,is_default= :is_default,secret= :secret,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id= :id',
            { replacements: values, transaction },
          );
        else {
          await sequelize.query(
            'INSERT INTO NotificationChannels(name,type,enabled,is_default,secret) VALUES(:name,:type,:enabled,:is_default,:secret)',
            { replacements: values, transaction },
          );
          const [r] = (await sequelize.query<any>(
            'SELECT last_insert_rowid() id',
            { type: 'SELECT' as any, transaction },
          )) as any[];
          id = r.id;
        }
        return { id };
      },
    );
  }
  async archive(id: number, version: number) {
    return sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const [channel] = (await sequelize.query<any>(
          'SELECT version FROM NotificationChannels WHERE id= :id',
          { replacements: { id }, type: 'SELECT' as any, transaction },
        )) as any[];
        if (!channel) throw new ExecutionError('CHANNEL_NOT_FOUND', 404);
        if (channel.version !== version)
          throw new ExecutionError('CHANNEL_VERSION_CONFLICT', 409);
        await sequelize.query(
          'UPDATE NotificationChannels SET archived=1,enabled=0,is_default=0,version=version+1,secret=NULL WHERE id= :id',
          { replacements: { id }, transaction },
        );
        return { id };
      },
    );
  }
  async test(id: number) {
    await this.get(id);
    const key = 'test:' + randomUUID();
    await sequelize.query(
      `INSERT INTO NotificationOutbox(event_type,channel_id,dedupe_key,message) VALUES('TEST',:id,:key,:message)`,
      {
        replacements: {
          id,
          key,
          message: JSON.stringify({
            event: 'TEST',
            title: 'This is a test notification',
          }),
        },
      },
    );
    const [row] = await selectRows(
      'SELECT id,status FROM NotificationOutbox WHERE dedupe_key= :key',
      { key },
    );
    return row;
  }
  async policy(taskId: number) {
    const [row] = await selectRows(
      'SELECT * FROM TaskNotificationPolicies WHERE task_id= :id',
      { id: taskId },
    );
    if (!row) throw new ExecutionError('TASK_NOT_FOUND', 404);
    return {
      ...row,
      channels: (
        await selectRows(
          'SELECT channel_id FROM TaskNotificationChannelBindings WHERE task_id= :id',
          { id: taskId },
        )
      ).map((r) => r.channel_id),
    };
  }
  async savePolicy(taskId: number, body: any) {
    strict(body, [
      ...flags,
      'failure_threshold',
      'repeat_every_failures',
      'channel_mode',
      'channels',
      'expected_version',
    ]);
    for (const key of flags)
      if (typeof body[key] !== 'boolean')
        throw new ExecutionError('POLICY_INVALID', 400);
    if (
      !['DEFAULT', 'EXPLICIT', 'NONE'].includes(body.channel_mode) ||
      !Number.isInteger(body.failure_threshold) ||
      body.failure_threshold < 1 ||
      body.failure_threshold > 1000 ||
      !Number.isInteger(body.repeat_every_failures ?? 0) ||
      (body.repeat_every_failures ?? 0) < 0 ||
      (body.repeat_every_failures ?? 0) > 1000 ||
      !Array.isArray(body.channels) ||
      body.channels.length > 100
    )
      throw new ExecutionError('POLICY_INVALID', 400);
    const ids = [...new Set(body.channels.map(positiveId))];
    await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const [row] = (await sequelize.query<any>(
          'SELECT version FROM TaskNotificationPolicies WHERE task_id= :id',
          { replacements: { id: taskId }, type: 'SELECT' as any, transaction },
        )) as any[];
        if (!row) throw new ExecutionError('TASK_NOT_FOUND', 404);
        if (row.version !== body.expected_version)
          throw new ExecutionError('POLICY_VERSION_CONFLICT');
        for (const id of ids) {
          const [channel] = (await sequelize.query<any>(
            'SELECT id FROM NotificationChannels WHERE id= :id AND archived=0',
            { replacements: { id }, type: 'SELECT' as any, transaction },
          )) as any[];
          if (!channel) throw new ExecutionError('CHANNEL_NOT_FOUND', 404);
        }
        await sequelize.query(
          `UPDATE TaskNotificationPolicies SET ${flags
            .map((k) => `${k}=:${k}`)
            .join(
              ',',
            )},failure_threshold= :failure_threshold,repeat_every_failures= :repeat_every_failures,channel_mode= :channel_mode,version=version+1 WHERE task_id= :taskId`,
          {
            replacements: {
              ...body,
              repeat_every_failures: body.repeat_every_failures ?? 0,
              taskId,
            },
            transaction,
          },
        );
        await sequelize.query(
          'DELETE FROM TaskNotificationChannelBindings WHERE task_id= :taskId',
          { replacements: { taskId }, transaction },
        );
        for (const channelId of ids)
          await sequelize.query(
            'INSERT INTO TaskNotificationChannelBindings VALUES(:taskId,:channelId)',
            { replacements: { taskId, channelId }, transaction },
          );
      },
    );
    return this.policy(taskId);
  }
  async send(id: number, message: any, dedupe: string) {
    const [channel] = await selectRows(
      'SELECT * FROM NotificationChannels WHERE id= :id',
      { id },
    );
    if (!channel || !channel.enabled || channel.archived)
      throw new ExecutionError('CHANNEL_DISABLED');
    const secret = decodeJson(channel.secret);
    if (!secret) throw new ExecutionError('CHANNEL_SECRET_MISSING');
    if (channel.type === 'WEBHOOK') {
      const res = await notificationTransport.request(secret.url, {
        json: message,
        headers: {
          'Idempotency-Key': dedupe,
          ...(secret.authorization
            ? { Authorization: secret.authorization }
            : {}),
        },
      });
      if (res.statusCode < 200 || res.statusCode >= 300)
        throw new ExecutionError('PROVIDER_HTTP_FAILED');
      return;
    }
    const title =
      message.event === 'TEST'
        ? 'This is a test notification'
        : `Task ${message.task?.name ?? message.task?.id}: ${message.event}`;
    const content =
      message.event === 'TEST'
        ? 'This is a test notification'
        : `Run ${message.run.id}; status ${message.run.status}; trigger ${
            message.run.trigger_type
          }; attempts ${message.run.attempts}; started ${
            message.run.started_at ?? '-'
          }; finished ${message.run.finished_at ?? '-'}; code ${
            message.run.error_code ?? 'SUCCESS'
          }`;
    // Per-delivery adapter instance: no shared title/content/credential state and no system-secret fallback.
    const { default: NotificationService } = await import('./notify');
    const adapter = new NotificationService(notificationTransport as any);
    const delivered = await adapter.testNotify(
      { type: channel.type, ...secret } as any,
      title,
      content,
    );
    if (!delivered) throw new ExecutionError('PROVIDER_REJECTED');
  }
}
