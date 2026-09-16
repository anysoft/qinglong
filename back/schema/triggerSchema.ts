import { triggerTimezone } from '../shared/triggerTimezone';
import {
  Model,
  ModelStatic,
  Sequelize,
  Transaction,
  QueryTypes,
} from 'sequelize';
import { cronNext } from '../shared/triggerDefinition';

export async function createTriggerSchema(
  database: Sequelize,
  transaction: Transaction,
  models: ModelStatic<Model>[],
) {
  for (const name of [
    'TaskTriggers',
    'CronTriggers',
    'WebhookTriggers',
    'GitUpdateTriggers',
    'TriggerEvents',
    'DiscoveryPolicies',
  ]) {
    const model = models.find((m) => m.tableName === name);
    if (!model) throw new Error('TRIGGER_SCHEMA_MODEL_MISSING:' + name);
    await model.sync(Object.assign({ force: false }, { transaction }));
  }
  {
    for (const sql of [
      'ALTER TABLE TaskRuns ADD COLUMN trigger_id INTEGER REFERENCES TaskTriggers(id) ON DELETE SET NULL',
      'ALTER TABLE TaskRuns ADD COLUMN event_id INTEGER REFERENCES TriggerEvents(id) ON DELETE SET NULL',
      'ALTER TABLE TaskRuns ADD COLUMN submission_key VARCHAR(255)',
      'CREATE UNIQUE INDEX task_runs_submission_key ON TaskRuns(submission_key)',
    ])
      await database.query(sql, { transaction });
  }
  for (const action of ['INSERT', 'UPDATE']) {
    await database.query(
      `DROP TRIGGER IF EXISTS task_run_fields_${action.toLowerCase()}`,
      { transaction },
    );
    await database.query(
      `CREATE TRIGGER task_run_fields_${action.toLowerCase()} BEFORE ${action} ON TaskRuns WHEN NEW.attempt_count<0 OR NEW.cancel_requested NOT IN (0,1) OR NEW.trigger_type NOT IN ('MANUAL','SCHEDULE','API','INTERNAL','CRON','WEBHOOK','GIT_UPDATE') OR NEW.concurrency_policy NOT IN ('FORBID','QUEUE','ALLOW') OR (NEW.task_id IS NULL AND NEW.status IN ('QUEUED','RESOLVING','RUNNING')) BEGIN SELECT RAISE(ABORT,'TASK_RUN_FIELDS_INVALID'); END`,
      { transaction },
    );
    await database.query(
      `CREATE TRIGGER task_trigger_fields_${action.toLowerCase()} BEFORE ${action} ON TaskTriggers WHEN NEW.type NOT IN ('CRON','WEBHOOK','GIT_UPDATE') OR NEW.origin NOT IN ('USER','DISCOVERY') OR NEW.enabled NOT IN (0,1) OR NEW.version<1 BEGIN SELECT RAISE(ABORT,'TRIGGER_FIELDS_INVALID'); END`,
      { transaction },
    );
    await database.query(
      `CREATE TRIGGER trigger_event_fields_${action.toLowerCase()} BEFORE ${action} ON TriggerEvents WHEN NEW.status NOT IN ('RECEIVED','PROCESSING','SUBMITTED','SKIPPED','FAILED') OR NEW.trigger_type NOT IN ('CRON','WEBHOOK','GIT_UPDATE') BEGIN SELECT RAISE(ABORT,'TRIGGER_EVENT_INVALID'); END`,
      { transaction },
    );
    for (const [table, type] of [
      ['CronTriggers', 'CRON'],
      ['WebhookTriggers', 'WEBHOOK'],
      ['GitUpdateTriggers', 'GIT_UPDATE'],
    ])
      await database.query(
        `CREATE TRIGGER ${table}_kind_${action.toLowerCase()} BEFORE ${action} ON ${table} WHEN NOT EXISTS(SELECT 1 FROM TaskTriggers WHERE id=NEW.trigger_id AND type='${type}') BEGIN SELECT RAISE(ABORT,'TRIGGER_CONFIG_KIND_INVALID'); END`,
        { transaction },
      );
  }
  await database.query(
    "CREATE TRIGGER task_trigger_identity_update BEFORE UPDATE ON TaskTriggers WHEN NEW.task_id IS NOT OLD.task_id OR NEW.type IS NOT OLD.type OR NEW.discovery_key IS NOT OLD.discovery_key OR (OLD.origin='USER' AND NEW.origin<>'USER') BEGIN SELECT RAISE(ABORT,'TRIGGER_IDENTITY_IMMUTABLE'); END",
    { transaction },
  );
  for (const action of ['INSERT', 'UPDATE']) {
    await database.query(
      `CREATE TRIGGER cron_trigger_fields_${action.toLowerCase()} BEFORE ${action} ON CronTriggers WHEN NEW.misfire_policy NOT IN ('SKIP','FIRE_ONCE') OR length(NEW.expression)<1 OR length(NEW.expression)>255 OR length(NEW.timezone)<1 OR NEW.next_fire_at IS NULL BEGIN SELECT RAISE(ABORT,'CRON_FIELDS_INVALID'); END`,
      { transaction },
    );
    await database.query(
      `CREATE TRIGGER webhook_trigger_fields_${action.toLowerCase()} BEFORE ${action} ON WebhookTriggers WHEN length(NEW.secret_hash)<>64 OR NEW.secret_hash GLOB '*[^0-9a-f]*' OR length(NEW.public_id)<>36 BEGIN SELECT RAISE(ABORT,'WEBHOOK_FIELDS_INVALID'); END`,
      { transaction },
    );
    await database.query(
      `CREATE TRIGGER git_trigger_fields_${action.toLowerCase()} BEFORE ${action} ON GitUpdateTriggers WHEN NEW.mode NOT IN ('ANY_CHANGE','SOURCE_CHANGE','PATH_FILTER') OR NEW.fire_on_initial NOT IN (0,1) OR NOT json_valid(NEW.path_filters) OR json_type(NEW.path_filters)<>'array' BEGIN SELECT RAISE(ABORT,'GIT_TRIGGER_FIELDS_INVALID'); END`,
      { transaction },
    );
  }
  await database.query(
    "CREATE TRIGGER task_run_event_identity_insert BEFORE INSERT ON TaskRuns WHEN NEW.event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM TriggerEvents e WHERE e.id=NEW.event_id AND e.task_id=NEW.task_id AND e.trigger_id IS NEW.trigger_id AND e.trigger_type=NEW.trigger_type AND NEW.submission_key='event:'||e.id) BEGIN SELECT RAISE(ABORT,'TASK_RUN_EVENT_IDENTITY_INVALID'); END",
    { transaction },
  );
  const tasks = await database.query<any>(
    "SELECT id,schedule,origin,discovery_key,discovery_definition FROM Tasks WHERE (schedule IS NOT NULL AND trim(schedule)<>'') OR (origin='DISCOVERED' AND discovery_key IS NOT NULL AND discovery_definition IS NOT NULL)",
    { type: QueryTypes.SELECT, transaction },
  );
  const now = new Date();
  const timezone = await triggerTimezone(database, transaction);
  for (const task of tasks) {
    const definition = task.discovery_definition
      ? JSON.parse(task.discovery_definition)
      : null;
    const expression = task.schedule?.trim()
      ? task.schedule
      : definition?.schedule;
    if (!expression) continue;
    const origin =
      task.origin === 'DISCOVERED' && definition?.schedule === task.schedule
        ? 'DISCOVERY'
        : 'USER';
    // Invalid persisted schedules abort the entire migration; user data stays untouched.
    const next = cronNext(expression, timezone, now);
    const trigger = models.find((m) => m.tableName === 'TaskTriggers')!;
    const row = await trigger.create(
      {
        task_id: task.id,
        type: 'CRON',
        origin,
        enabled: !!task.schedule?.trim(),
        discovery_key: task.discovery_key ? 'source-cron' : null,
      },
      { transaction },
    );
    await models
      .find((m) => m.tableName === 'CronTriggers')!
      .create(
        {
          trigger_id: row.get('id'),
          expression,
          timezone,
          misfire_policy: 'SKIP',
          next_fire_at: next,
        },
        { transaction },
      );
  }
  await database.query('ALTER TABLE Tasks DROP COLUMN schedule', {
    transaction,
  });
  const subscriptions = await database.query<any>(
    'SELECT id,whitelist,blacklist,dependences,extensions,autoAddCron,autoDelCron FROM Subscriptions',
    { type: QueryTypes.SELECT, transaction },
  );
  for (const sub of subscriptions) {
    const review = !!(
      sub.whitelist ||
      sub.blacklist ||
      sub.dependences ||
      sub.autoDelCron === 0
    );
    const byExtension: Record<string, string> = {
      py: 'PYTHON',
      js: 'JAVASCRIPT',
      mjs: 'JAVASCRIPT',
      cjs: 'JAVASCRIPT',
      ts: 'TYPESCRIPT',
      sh: 'SHELL',
    };
    const languages = [
      ...new Set(
        (sub.extensions || 'py js ts sh')
          .split(/[|\s]+/)
          .filter(Boolean)
          .map((extension: string) => byExtension[extension])
          .filter(Boolean),
      ),
    ];
    await models
      .find((m) => m.tableName === 'DiscoveryPolicies')!
      .create(
        {
          subscription_id: sub.id,
          enabled: !review && sub.autoAddCron !== 0,
          languages,
          last_result: review
            ? {
                diagnostic: 'MIGRATED_FILTER_REVIEW_REQUIRED',
                previous_settings: {
                  whitelist: sub.whitelist,
                  blacklist: sub.blacklist,
                  dependences: sub.dependences,
                  autoDelCron: sub.autoDelCron,
                },
              }
            : null,
        },
        { transaction },
      );
  }
  for (const field of [
    'whitelist',
    'blacklist',
    'dependences',
    'extensions',
    'autoAddCron',
    'autoDelCron',
  ])
    await database.query(`ALTER TABLE Subscriptions DROP COLUMN ${field}`, {
      transaction,
    });
}
