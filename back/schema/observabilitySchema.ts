import { Sequelize, Transaction } from 'sequelize';

/** Additive v8 → v9 evolution; no execution history is rebuilt. */
export async function createObservabilitySchema(
  db: Sequelize,
  transaction: Transaction,
) {
  const statements = [
    `ALTER TABLE TaskRuns ADD COLUMN log_size INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE TaskRuns ADD COLUMN last_log_at DATETIME`,
    `ALTER TABLE TaskRuns ADD COLUMN log_truncated INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE TaskRunAttempts ADD COLUMN result JSON`,
    `ALTER TABLE TaskRunAttempts ADD COLUMN retry_decision INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE TaskRunAttempts ADD COLUMN retry_delay INTEGER NOT NULL DEFAULT 0`,
    `CREATE INDEX task_runs_status_finished ON TaskRuns(status,finished_at,id)`,
    `CREATE INDEX task_runs_task_finished ON TaskRuns(task_id,finished_at,id)`,
    `CREATE INDEX task_runs_trigger_submitted ON TaskRuns(trigger_type,submitted_at,id)`,
    `CREATE INDEX task_runs_finished ON TaskRuns(finished_at,id)`,
    `CREATE TABLE TaskRunEvents (id INTEGER PRIMARY KEY AUTOINCREMENT, task_run_id INTEGER NOT NULL REFERENCES TaskRuns(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, type TEXT NOT NULL, metadata JSON NOT NULL DEFAULT '{}', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(task_run_id,sequence))`,
    `CREATE TABLE TaskHealthStates (task_id INTEGER PRIMARY KEY REFERENCES Tasks(id) ON DELETE CASCADE, last_run_id INTEGER REFERENCES TaskRuns(id) ON DELETE SET NULL, last_terminal_status TEXT, last_success_at DATETIME, last_failure_at DATETIME, consecutive_failures INTEGER NOT NULL DEFAULT 0, health_state TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(health_state IN ('UNKNOWN','HEALTHY','FAILING')), failure_alert_open INTEGER NOT NULL DEFAULT 0 CHECK(failure_alert_open IN (0,1)), updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE NotificationChannels (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)), version INTEGER NOT NULL DEFAULT 1, non_secret_config JSON NOT NULL DEFAULT '{}', secret TEXT, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE TaskNotificationPolicies (task_id INTEGER PRIMARY KEY REFERENCES Tasks(id) ON DELETE CASCADE, enabled INTEGER NOT NULL DEFAULT 0, notify_success INTEGER NOT NULL DEFAULT 0, notify_failure INTEGER NOT NULL DEFAULT 0, notify_timeout INTEGER NOT NULL DEFAULT 0, notify_interrupted INTEGER NOT NULL DEFAULT 0, notify_cancelled INTEGER NOT NULL DEFAULT 0, notify_recovery INTEGER NOT NULL DEFAULT 0, failure_threshold INTEGER NOT NULL DEFAULT 1 CHECK(failure_threshold BETWEEN 1 AND 1000), repeat_every_failures INTEGER NOT NULL DEFAULT 0 CHECK(repeat_every_failures BETWEEN 0 AND 1000), channel_mode TEXT NOT NULL DEFAULT 'DEFAULT' CHECK(channel_mode IN ('DEFAULT','EXPLICIT','NONE')), version INTEGER NOT NULL DEFAULT 1)`,
    `CREATE TABLE TaskNotificationChannelBindings (task_id INTEGER NOT NULL REFERENCES Tasks(id) ON DELETE CASCADE, channel_id INTEGER NOT NULL REFERENCES NotificationChannels(id) ON DELETE RESTRICT, PRIMARY KEY(task_id,channel_id))`,
    `CREATE TABLE NotificationOutbox (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, task_id INTEGER REFERENCES Tasks(id) ON DELETE SET NULL, task_run_id INTEGER REFERENCES TaskRuns(id) ON DELETE RESTRICT, channel_id INTEGER NOT NULL REFERENCES NotificationChannels(id) ON DELETE RESTRICT, dedupe_key TEXT NOT NULL UNIQUE, message JSON NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','RETRY','DEAD')), attempt_count INTEGER NOT NULL DEFAULT 0, next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, claim_token TEXT, claimed_at DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at DATETIME, last_error_code TEXT)`,
    `CREATE INDEX notification_outbox_due ON NotificationOutbox(status,next_attempt_at,id)`,
    `CREATE INDEX notification_outbox_run ON NotificationOutbox(task_run_id,id)`,
    `CREATE TABLE NotificationDeliveries (id INTEGER PRIMARY KEY AUTOINCREMENT, outbox_id INTEGER NOT NULL REFERENCES NotificationOutbox(id) ON DELETE RESTRICT, attempt INTEGER NOT NULL, started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at DATETIME, result TEXT NOT NULL, error_code TEXT, UNIQUE(outbox_id,attempt))`,
    `INSERT INTO TaskHealthStates(task_id) SELECT id FROM Tasks`,
    `INSERT INTO TaskNotificationPolicies(task_id,enabled,notify_success,notify_failure,notify_timeout,notify_interrupted,notify_cancelled,repeat_every_failures) SELECT task_id,notification<>'NONE',notification IN ('SUCCESS','ALWAYS'),notification IN ('FAILURE','ALWAYS'),notification IN ('FAILURE','ALWAYS'),notification IN ('FAILURE','ALWAYS'),notification IN ('FAILURE','ALWAYS'),1 FROM TaskExecutionSettings`,
    // Existing system credentials are preserved in the same protected-at-rest domain, never emitted in DTOs.
    `INSERT INTO NotificationChannels(name,type,is_default,secret) SELECT 'Imported notification',json_extract(info,'$.type'),1,json_remove(info,'$.type') FROM Auths WHERE type='notification' AND json_valid(info) AND json_extract(info,'$.type') IS NOT NULL AND json_extract(info,'$.type')<>''`,
    `CREATE TRIGGER task_health_create AFTER INSERT ON Tasks BEGIN INSERT INTO TaskHealthStates(task_id) VALUES(NEW.id); END`,
    `CREATE TRIGGER task_policy_create AFTER INSERT ON TaskExecutionSettings BEGIN INSERT INTO TaskNotificationPolicies(task_id,enabled,notify_success,notify_failure,notify_timeout,notify_interrupted,notify_cancelled,repeat_every_failures) VALUES(NEW.task_id,NEW.notification<>'NONE',NEW.notification IN ('SUCCESS','ALWAYS'),NEW.notification IN ('FAILURE','ALWAYS'),NEW.notification IN ('FAILURE','ALWAYS'),NEW.notification IN ('FAILURE','ALWAYS'),NEW.notification IN ('FAILURE','ALWAYS'),1); END`,
    `CREATE TRIGGER run_submitted_event AFTER INSERT ON TaskRuns BEGIN INSERT INTO TaskRunEvents(task_run_id,sequence,type) VALUES(NEW.id,1,'RUN_SUBMITTED'); INSERT INTO TaskRunEvents(task_run_id,sequence,type) VALUES(NEW.id,2,'RUN_'||NEW.status); END`,
    `CREATE TRIGGER run_status_event AFTER UPDATE OF status ON TaskRuns WHEN OLD.status<>NEW.status BEGIN INSERT INTO TaskRunEvents(task_run_id,sequence,type) SELECT NEW.id,COALESCE(MAX(sequence),0)+1,'RUN_'||NEW.status FROM TaskRunEvents WHERE task_run_id=NEW.id; END`,
    `CREATE TRIGGER run_cancel_event AFTER UPDATE OF cancel_requested ON TaskRuns WHEN OLD.cancel_requested=0 AND NEW.cancel_requested=1 BEGIN INSERT INTO TaskRunEvents(task_run_id,sequence,type) SELECT NEW.id,COALESCE(MAX(sequence),0)+1,'CANCEL_REQUESTED' FROM TaskRunEvents WHERE task_run_id=NEW.id; END`,
    `CREATE TRIGGER attempt_start_event AFTER INSERT ON TaskRunAttempts BEGIN INSERT INTO TaskRunEvents(task_run_id,sequence,type,metadata) SELECT NEW.task_run_id,COALESCE(MAX(sequence),0)+1,'ATTEMPT_STARTED',json_object('attempt',NEW.attempt_number) FROM TaskRunEvents WHERE task_run_id=NEW.task_run_id; END`,
  ];
  for (const sql of statements) await db.query(sql, { transaction });
  // Bounded SQL backfill: last completion and consecutive failure-like results since the last success.
  await db.query(
    `UPDATE TaskHealthStates SET
    last_run_id=(SELECT id FROM TaskRuns r WHERE r.task_id=TaskHealthStates.task_id AND r.status IN ('SUCCESS','FAILED','TIMEOUT','INTERRUPTED','CANCELLED','SKIPPED') ORDER BY finished_at DESC,id DESC LIMIT 1),
    last_success_at=(SELECT MAX(finished_at) FROM TaskRuns r WHERE r.task_id=TaskHealthStates.task_id AND r.status='SUCCESS'),
    last_failure_at=(SELECT MAX(finished_at) FROM TaskRuns r WHERE r.task_id=TaskHealthStates.task_id AND r.status IN ('FAILED','TIMEOUT','INTERRUPTED'))`,
    { transaction },
  );
  await db.query(
    `UPDATE TaskHealthStates SET last_terminal_status=(SELECT status FROM TaskRuns WHERE id=last_run_id), consecutive_failures=(SELECT COUNT(*) FROM TaskRuns r WHERE r.task_id=TaskHealthStates.task_id AND r.status IN ('FAILED','TIMEOUT','INTERRUPTED') AND NOT EXISTS(SELECT 1 FROM TaskRuns s WHERE s.task_id=r.task_id AND s.status='SUCCESS' AND (s.finished_at>r.finished_at OR (s.finished_at=r.finished_at AND s.id>r.id))))`,
    { transaction },
  );
  await db.query(
    `UPDATE TaskHealthStates SET health_state=CASE WHEN consecutive_failures>0 THEN 'FAILING' WHEN last_success_at IS NOT NULL THEN 'HEALTHY' ELSE 'UNKNOWN' END`,
    { transaction },
  );
  const terminal = `NEW.status IN ('SUCCESS','FAILED','TIMEOUT','INTERRUPTED','CANCELLED','SKIPPED')`;
  const event = `CASE WHEN NEW.status='SUCCESS' AND h.failure_alert_open=1 AND p.notify_recovery=1 THEN 'RECOVERY' ELSE NEW.status END`;
  const eligible = `p.enabled=1 AND p.channel_mode<>'NONE' AND (
    (NEW.status='SUCCESS' AND (p.notify_success=1 OR (h.failure_alert_open=1 AND p.notify_recovery=1))) OR
    (NEW.status='CANCELLED' AND p.notify_cancelled=1) OR
    (NEW.status IN ('FAILED','TIMEOUT','INTERRUPTED') AND CASE NEW.status WHEN 'FAILED' THEN p.notify_failure WHEN 'TIMEOUT' THEN p.notify_timeout ELSE p.notify_interrupted END=1 AND h.consecutive_failures>=p.failure_threshold AND (h.failure_alert_open=0 OR (p.repeat_every_failures>0 AND (h.consecutive_failures-p.failure_threshold)%p.repeat_every_failures=0))))`;
  const body = `
    UPDATE TaskHealthStates SET last_run_id=NEW.id,last_terminal_status=NEW.status,updated_at=CURRENT_TIMESTAMP,
      last_success_at=CASE WHEN NEW.status='SUCCESS' THEN NEW.finished_at ELSE last_success_at END,
      last_failure_at=CASE WHEN NEW.status IN ('FAILED','TIMEOUT','INTERRUPTED') THEN NEW.finished_at ELSE last_failure_at END,
      consecutive_failures=CASE WHEN NEW.status='SUCCESS' THEN 0 WHEN NEW.status IN ('FAILED','TIMEOUT','INTERRUPTED') THEN consecutive_failures+1 ELSE consecutive_failures END,
      health_state=CASE WHEN NEW.status='SUCCESS' THEN 'HEALTHY' WHEN NEW.status IN ('FAILED','TIMEOUT','INTERRUPTED') THEN 'FAILING' ELSE health_state END WHERE task_id=NEW.task_id;
    INSERT INTO NotificationOutbox(event_type,task_id,task_run_id,channel_id,dedupe_key,message)
      SELECT ${event},NEW.task_id,NEW.id,c.id,NEW.id||':'||${event}||':'||c.id,
      json_object('event',${event},'task',json_object('id',NEW.task_id,'name',t.name),'run',json_object('id',NEW.id,'status',NEW.status,'trigger_type',NEW.trigger_type,'started_at',NEW.started_at,'finished_at',NEW.finished_at,'duration_ms',CASE WHEN NEW.started_at IS NULL THEN NULL ELSE MAX(0,CAST(ROUND((julianday(NEW.finished_at)-julianday(NEW.started_at))*86400000) AS INTEGER)) END,'attempts',NEW.attempt_count,'error_code',NEW.error_code))
      FROM TaskNotificationPolicies p JOIN TaskHealthStates h ON h.task_id=p.task_id JOIN Tasks t ON t.id=p.task_id JOIN NotificationChannels c ON c.enabled=1 AND c.archived=0 AND (p.channel_mode='DEFAULT' AND c.is_default=1 OR p.channel_mode='EXPLICIT' AND EXISTS(SELECT 1 FROM TaskNotificationChannelBindings b WHERE b.task_id=p.task_id AND b.channel_id=c.id))
      WHERE p.task_id=NEW.task_id AND ${eligible};
    UPDATE TaskHealthStates SET failure_alert_open=CASE WHEN NEW.status='SUCCESS' THEN 0 WHEN NEW.status IN ('FAILED','TIMEOUT','INTERRUPTED') AND EXISTS(SELECT 1 FROM NotificationOutbox WHERE task_run_id=NEW.id AND event_type IN ('FAILED','TIMEOUT','INTERRUPTED')) THEN 1 ELSE failure_alert_open END WHERE task_id=NEW.task_id;
  `;
  await db.query(
    `CREATE TRIGGER run_terminal_observability AFTER UPDATE OF status ON TaskRuns WHEN OLD.status<>NEW.status AND ${terminal} BEGIN ${body} END`,
    { transaction },
  );
  await db.query(
    `CREATE TRIGGER run_terminal_insert_observability AFTER INSERT ON TaskRuns WHEN ${terminal} BEGIN ${body} END`,
    { transaction },
  );
}
