import path from 'path';
import { randomUUID } from 'crypto';
import { Transaction, QueryTypes } from 'sequelize';
import { sequelize } from '../data';
import RuntimePathResolver from './runtimePaths';
import { RuntimeLease } from './runtimeProcess';
import NotificationChannels from './notificationChannels';
import { decodeJson, selectRows } from './runObservability';
import { safeExecutionError, ExecutionError } from '../shared/execution';
class DeliveryPaths extends RuntimePathResolver {
  async lock(id: number) {
    return path.join(
      await this.directory('.locks', true),
      `notification-${id}.lock`,
    );
  }
}
export default class NotificationDispatcher {
  private timer?: NodeJS.Timeout;
  private working = false;
  private closed = false;
  constructor(
    readonly paths = new DeliveryPaths(),
    readonly channels = new NotificationChannels(),
    readonly retryDelay = 60000,
    readonly maxAttempts = 5,
  ) {}
  start() {
    if (this.timer) return;
    this.closed = false;
    this.timer = setInterval(() => void this.tick().catch(() => {}), 1000);
    this.timer.unref();
    void this.tick().catch(() => {});
  }
  async stop() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    const deadline = Date.now() + 45000;
    while (this.working && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 20));
  }
  async tick() {
    if (this.working || this.closed) return;
    this.working = true;
    try {
      const rows = await selectRows(
        `SELECT id FROM NotificationOutbox WHERE (status IN ('PENDING','RETRY') AND next_attempt_at<= :now) OR status='SENDING' ORDER BY id LIMIT 32`,
        { now: new Date() },
      );
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(4, rows.length) }, async () => {
          while (next < rows.length && !this.closed) {
            await this.deliver(rows[next++].id);
          }
        }),
      );
    } finally {
      this.working = false;
    }
  }
  async deliver(id: number) {
    let lease: RuntimeLease;
    try {
      lease = await RuntimeLease.acquire(this.paths, id);
    } catch (e) {
      if (safeExecutionError(e) === 'RUNTIME_BUSY') return;
      throw e;
    }
    const token = randomUUID();
    try {
      const row = await sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        async (transaction) => {
          const [current] = await sequelize.query<any>(
            'SELECT * FROM NotificationOutbox WHERE id= :id',
            { replacements: { id }, type: QueryTypes.SELECT, transaction },
          );
          if (
            !current ||
            !['PENDING', 'RETRY', 'SENDING'].includes(current.status) ||
            (current.status !== 'SENDING' &&
              new Date(current.next_attempt_at).getTime() > Date.now())
          )
            return null;
          if (current.status === 'SENDING') {
            await sequelize.query(
              "UPDATE NotificationDeliveries SET result='INTERRUPTED',error_code='DELIVERY_INTERRUPTED',finished_at=CURRENT_TIMESTAMP WHERE outbox_id= :id AND result='SENDING'",
              { replacements: { id }, transaction },
            );
            await sequelize.query(
              "UPDATE NotificationOutbox SET status='RETRY',last_error_code='DELIVERY_INTERRUPTED',claim_token=NULL,claimed_at=NULL,next_attempt_at=CURRENT_TIMESTAMP WHERE id= :id",
              { replacements: { id }, transaction },
            );
            return null;
          }
          const attempt = current.attempt_count + 1;
          await sequelize.query(
            "UPDATE NotificationOutbox SET status='SENDING',attempt_count= :attempt,claim_token= :token,claimed_at=CURRENT_TIMESTAMP WHERE id= :id",
            { replacements: { id, attempt, token }, transaction },
          );
          await sequelize.query(
            "INSERT INTO NotificationDeliveries(outbox_id,attempt,result) VALUES(:id,:attempt,'SENDING')",
            { replacements: { id, attempt }, transaction },
          );
          return { ...current, attempt_count: attempt };
        },
      );
      if (!row) return;
      let code: string | null = null;
      try {
        await this.channels.send(
          row.channel_id,
          decodeJson(row.message),
          row.dedupe_key,
        );
      } catch (e) {
        const safe = safeExecutionError(e, 'PROVIDER_FAILED');
        code = [
          'CHANNEL_DISABLED',
          'CHANNEL_SECRET_MISSING',
          'PROVIDER_HTTP_FAILED',
          'PROVIDER_RESPONSE_LIMIT',
          'PROVIDER_NETWORK_FAILED',
          'PROVIDER_REJECTED',
          'CHANNEL_URL_INVALID',
        ].includes(safe)
          ? safe
          : 'PROVIDER_FAILED';
      }
      const status = !code
        ? 'SENT'
        : row.attempt_count >= this.maxAttempts ||
          [
            'CHANNEL_DISABLED',
            'CHANNEL_SECRET_MISSING',
            'CHANNEL_URL_INVALID',
          ].includes(code)
        ? 'DEAD'
        : 'RETRY';
      await sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        async (transaction) => {
          await sequelize.query(
            `UPDATE NotificationOutbox SET status= :status,last_error_code= :code,sent_at= :sent,next_attempt_at= :next,claim_token=NULL,claimed_at=NULL WHERE id= :id AND claim_token= :token`,
            {
              replacements: {
                id,
                token,
                status,
                code,
                sent: status === 'SENT' ? new Date() : null,
                next: new Date(
                  Date.now() +
                    Math.min(
                      3600000,
                      this.retryDelay *
                        2 ** Math.min(10, row.attempt_count - 1),
                    ),
                ),
              },
              transaction,
            },
          );
          await sequelize.query(
            'UPDATE NotificationDeliveries SET result= :status,error_code= :code,finished_at=CURRENT_TIMESTAMP WHERE outbox_id= :id AND attempt= :attempt',
            {
              replacements: { id, status, code, attempt: row.attempt_count },
              transaction,
            },
          );
        },
      );
    } finally {
      await lease.release();
    }
  }
  async retry(id: number) {
    await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const [row] = await sequelize.query<any>(
          'SELECT status FROM NotificationOutbox WHERE id= :id',
          { replacements: { id }, type: QueryTypes.SELECT, transaction },
        );
        if (!row) throw new ExecutionError('DELIVERY_NOT_FOUND', 404);
        if (!['DEAD', 'RETRY'].includes(row.status))
          throw new ExecutionError('DELIVERY_RETRY_INVALID');
        await sequelize.query(
          "UPDATE NotificationOutbox SET status='RETRY',next_attempt_at= :now WHERE id= :id",
          { replacements: { id, now: new Date() }, transaction },
        );
      },
    );
    return { id };
  }
  async list(query: Record<string, any> = {}) {
    const where: string[] = [];
    const values: any = {};
    if (query.run_id) {
      where.push('o.task_run_id= :run');
      values.run = Number(query.run_id);
    }
    if (query.cursor) {
      where.push('o.id< :cursor');
      values.cursor = Number(query.cursor);
    }
    if (query.status) {
      where.push('o.status= :status');
      values.status = String(query.status);
    }
    return selectRows(
      `SELECT o.id,o.event_type,o.task_id,o.task_run_id,o.channel_id,c.name channel_name,o.status,o.attempt_count,o.next_attempt_at,o.created_at,o.sent_at,o.last_error_code FROM NotificationOutbox o JOIN NotificationChannels c ON c.id=o.channel_id ${
        where.length ? 'WHERE ' + where.join(' AND ') : ''
      } ORDER BY o.id DESC LIMIT 100`,
      values,
    );
  }
  async attempts(id: number) {
    return selectRows(
      'SELECT attempt,started_at,finished_at,result,error_code FROM NotificationDeliveries WHERE outbox_id= :id ORDER BY attempt LIMIT 100',
      { id },
    );
  }
}
export const notificationDispatcher = new NotificationDispatcher();
