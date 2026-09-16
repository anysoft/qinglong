import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../data';
import { TaskRunModel } from '../data/taskRun';
import { ExecutionError } from '../shared/execution';

export const terminalStatuses = [
  'SUCCESS',
  'FAILED',
  'TIMEOUT',
  'INTERRUPTED',
  'CANCELLED',
  'SKIPPED',
];
export function positiveId(value: unknown) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
    throw new ExecutionError('OBSERVABILITY_ID_INVALID', 400);
  return Number(value);
}
export async function runEvent(
  runId: number,
  type: string,
  metadata: {
    attempt?: number;
    phase?: string;
    retry_delay?: number;
    hook_id?: number;
    status?: string;
  } = {},
) {
  if (!/^[A-Z_]{3,60}$/.test(type))
    throw new ExecutionError('RUN_EVENT_INVALID', 400);
  const safe = Object.fromEntries(
    Object.entries(metadata).filter(
      ([k, v]) =>
        ['attempt', 'phase', 'retry_delay', 'hook_id', 'status'].includes(k) &&
        ((typeof v === 'number' && Number.isFinite(v)) ||
          (typeof v === 'string' && /^[A-Z_]{1,60}$/.test(v))),
    ),
  );
  await sequelize.transaction(
    { type: Transaction.TYPES.IMMEDIATE },
    async (transaction) => {
      await sequelize.query(
        `INSERT INTO TaskRunEvents(task_run_id,sequence,type,metadata) SELECT :id,COALESCE(MAX(sequence),0)+1,:type,:metadata FROM TaskRunEvents WHERE task_run_id= :id`,
        {
          replacements: { id: runId, type, metadata: JSON.stringify(safe) },
          transaction,
        },
      );
    },
  );
}
export async function selectRows(
  sql: string,
  replacements: Record<string, any> = {},
) {
  return sequelize.query<any>(sql, { replacements, type: QueryTypes.SELECT });
}
export function decodeJson(value: any) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function publicRun(row: any) {
  const { owner_token, ...result } = row;
  result.result = decodeJson(result.result);
  result.snapshot_metadata = decodeJson(result.snapshot_metadata);
  return result;
}
export default class RunObservability {
  private readinessCache?: { at: number; ready: number };
  private async readyCount() {
    if (this.readinessCache && Date.now() - this.readinessCache.at < 30000)
      return this.readinessCache.ready;
    const { default: Resolver } = await import('./taskResourceResolver');
    const resolver = new Resolver();
    let after = 0,
      ready = 0;
    for (;;) {
      const rows = await selectRows(
        'SELECT id FROM Tasks WHERE id > :after ORDER BY id LIMIT 500',
        { after },
      );
      if (!rows.length) break;
      const resources = await resolver.resolve(rows.map((r) => r.id));
      ready += resources.filter((r) => r.readiness.status === 'READY').length;
      after = rows[rows.length - 1].id;
    }
    this.readinessCache = { at: Date.now(), ready };
    return ready;
  }
  async list(query: Record<string, any>) {
    const where: string[] = [];
    const values: Record<string, any> = {
      limit: Math.min(100, positiveId(query.limit ?? 50)),
    };
    for (const key of Object.keys(query))
      if (
        ![
          'task_id',
          'status',
          'trigger_type',
          'from',
          'to',
          'cursor',
          'limit',
        ].includes(key)
      )
        throw new ExecutionError('RUN_FILTER_INVALID', 400);
    if (query.task_id) {
      where.push('task_id= :task');
      values.task = positiveId(query.task_id);
    }
    if (query.status) {
      if (
        ![
          'QUEUED',
          'RESOLVING',
          'RUNNING',
          'RECOVERY_REQUIRED',
          ...terminalStatuses,
        ].includes(query.status)
      )
        throw new ExecutionError('RUN_FILTER_INVALID', 400);
      where.push('status= :status');
      values.status = query.status;
    }
    if (query.trigger_type) {
      if (
        ![
          'MANUAL',
          'API',
          'INTERNAL',
          'SCHEDULE',
          'CRON',
          'WEBHOOK',
          'GIT_UPDATE',
        ].includes(query.trigger_type)
      )
        throw new ExecutionError('RUN_FILTER_INVALID', 400);
      where.push('trigger_type= :trigger');
      values.trigger = query.trigger_type;
    }
    for (const key of ['from', 'to'])
      if (query[key]) {
        const date = new Date(query[key]);
        if (!Number.isFinite(date.getTime()))
          throw new ExecutionError('RUN_FILTER_INVALID', 400);
        where.push(`submitted_at ${key === 'from' ? '>=' : '<='} :${key}`);
        values[key] = date;
      }
    if (query.cursor) {
      let decoded;
      try {
        decoded = JSON.parse(
          Buffer.from(String(query.cursor), 'base64url').toString(),
        );
      } catch {
        throw new ExecutionError('RUN_CURSOR_INVALID', 400);
      }
      where.push('id< :cursor');
      values.cursor = positiveId(decoded.id);
    }
    const rows = await selectRows(
      `SELECT * FROM TaskRuns ${
        where.length ? 'WHERE ' + where.join(' AND ') : ''
      } ORDER BY id DESC LIMIT :limit`,
      values,
    );
    return {
      data: rows.map(publicRun),
      next_cursor:
        rows.length === values.limit
          ? Buffer.from(
              JSON.stringify({ id: rows[rows.length - 1].id }),
            ).toString('base64url')
          : null,
    };
  }
  async detail(id: number) {
    const [run] = await selectRows('SELECT * FROM TaskRuns WHERE id= :id', {
      id,
    });
    if (!run) throw new ExecutionError('TASK_RUN_NOT_FOUND', 404);
    const [task] = run.task_id
      ? await selectRows('SELECT id,name FROM Tasks WHERE id= :id', {
          id: run.task_id,
        })
      : [];
    return {
      ...publicRun(run),
      task: task ?? null,
      duration_ms:
        run.started_at && run.finished_at
          ? Math.max(
              0,
              new Date(run.finished_at).getTime() -
                new Date(run.started_at).getTime(),
            )
          : null,
    };
  }
  async attempts(id: number) {
    await this.detail(id);
    return (
      await selectRows(
        'SELECT * FROM TaskRunAttempts WHERE task_run_id= :id ORDER BY attempt_number',
        { id },
      )
    ).map((r) => ({ ...r, result: decodeJson(r.result) }));
  }
  async events(id: number, after = 0) {
    await this.detail(id);
    if (!Number.isSafeInteger(after) || after < 0)
      throw new ExecutionError('EVENT_CURSOR_INVALID', 400);
    return (
      await selectRows(
        'SELECT sequence,type,metadata,created_at FROM TaskRunEvents WHERE task_run_id= :id AND sequence> :after ORDER BY sequence LIMIT 200',
        { id, after },
      )
    ).map((r) => ({ ...r, metadata: decodeJson(r.metadata) }));
  }
  async health(id: number) {
    const [row] = await selectRows(
      'SELECT * FROM TaskHealthStates WHERE task_id= :id',
      { id },
    );
    if (!row) throw new ExecutionError('TASK_NOT_FOUND', 404);
    return row;
  }
  async summary(range = '24h', taskId?: number) {
    const hours = { '24h': 24, '7d': 168, '30d': 720 }[range];
    if (!hours) throw new ExecutionError('OBSERVABILITY_RANGE_INVALID', 400);
    const values: any = { since: new Date(Date.now() - hours * 3600000) };
    const task = taskId ? ' AND task_id= :task' : '';
    if (taskId) values.task = taskId;
    const counts = await selectRows(
      `SELECT status,COUNT(*) count,AVG((julianday(finished_at)-julianday(started_at))*86400000) average_duration_ms FROM TaskRuns WHERE finished_at>= :since${task} GROUP BY status`,
      values,
    );
    const queue = await selectRows(
      `SELECT status,COUNT(*) count FROM TaskRuns WHERE status IN ('QUEUED','RESOLVING','RUNNING','RECOVERY_REQUIRED')${task} GROUP BY status`,
      values,
    );
    const recent = await selectRows(
      `SELECT id,task_id,status,trigger_type,submitted_at,finished_at,error_code FROM TaskRuns WHERE submitted_at>= :since${task} ORDER BY id DESC LIMIT 20`,
      values,
    );
    const failures = await selectRows(
      `SELECT id,task_id,status,finished_at,error_code FROM TaskRuns WHERE status IN ('FAILED','TIMEOUT','INTERRUPTED') AND finished_at>= :since${task} ORDER BY finished_at DESC,id DESC LIMIT 20`,
      values,
    );
    const longest = await selectRows(
      `SELECT id,task_id,status,(julianday(finished_at)-julianday(started_at))*86400000 duration_ms FROM TaskRuns WHERE finished_at>= :since${task} ORDER BY duration_ms DESC,id DESC LIMIT 10`,
      values,
    );
    const triggers = await selectRows(
      `SELECT trigger_type,COUNT(*) count FROM TaskRuns WHERE submitted_at>= :since${task} GROUP BY trigger_type`,
      values,
    );
    const unhealthy = await selectRows(
      "SELECT h.*,t.name FROM TaskHealthStates h JOIN Tasks t ON t.id=h.task_id WHERE health_state='FAILING' ORDER BY h.updated_at DESC LIMIT 20",
    );
    const [tasks] = await selectRows(
      'SELECT COUNT(*) total,COALESCE(SUM(enabled),0) enabled FROM Tasks',
    );
    const [storage] = await selectRows(
      'SELECT COUNT(*) run_count,COALESCE(SUM(log_size),0) log_bytes FROM TaskRuns',
    );
    const [notifications] = await selectRows(
      'SELECT COUNT(*) delivery_count FROM NotificationDeliveries',
    );
    const success = Number(
        counts.find((r) => r.status === 'SUCCESS')?.count ?? 0,
      ),
      total = counts
        .filter((r) =>
          ['SUCCESS', 'FAILED', 'TIMEOUT', 'INTERRUPTED'].includes(r.status),
        )
        .reduce((sum, r) => sum + Number(r.count), 0);
    tasks.ready = await this.readyCount();
    return {
      range,
      tasks,
      counts,
      queue,
      recent,
      failures,
      longest,
      triggers,
      unhealthy,
      success_rate: total ? success / total : null,
      storage: { ...storage, ...notifications },
      retention: { automatic_deletion: false },
    };
  }
}
