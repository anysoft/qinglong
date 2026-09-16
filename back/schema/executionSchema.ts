import { Model, ModelStatic, Sequelize, Transaction } from 'sequelize';

/** Both migration and fresh installation use the same ORM tables and SQL guards. */
export async function createExecutionSchema(
  database: Sequelize,
  transaction: Transaction,
  models: ModelStatic<Model>[],
) {
  for (const name of ['TaskRuns', 'TaskRunAttempts']) {
    const model = models.find((item) => item.tableName === name);
    if (!model) throw new Error('EXECUTION_SCHEMA_MODEL_MISSING:' + name);
    await model.sync(Object.assign({ force: false }, { transaction }));
  }
  const statuses =
    "'QUEUED','RESOLVING','RUNNING','SUCCESS','FAILED','TIMEOUT','CANCELLED','INTERRUPTED','SKIPPED','RECOVERY_REQUIRED'";
  for (const table of ['TaskRuns', 'TaskRunAttempts']) {
    for (const action of ['INSERT', 'UPDATE']) {
      await database.query(
        `CREATE TRIGGER ${table}_status_${action.toLowerCase()} BEFORE ${action} ON ${table} WHEN NEW.status NOT IN (${statuses}) BEGIN SELECT RAISE(ABORT,'TASK_RUN_STATUS_INVALID'); END`,
        { transaction },
      );
    }
  }
  for (const action of ['INSERT', 'UPDATE']) {
    await database.query(
      `CREATE TRIGGER task_run_fields_${action.toLowerCase()} BEFORE ${action} ON TaskRuns WHEN NEW.attempt_count<0 OR NEW.cancel_requested NOT IN (0,1) OR NEW.trigger_type NOT IN ('MANUAL','SCHEDULE','API','INTERNAL') OR NEW.concurrency_policy NOT IN ('FORBID','QUEUE','ALLOW') OR (NEW.task_id IS NULL AND NEW.status IN ('QUEUED','RESOLVING','RUNNING')) BEGIN SELECT RAISE(ABORT,'TASK_RUN_FIELDS_INVALID'); END`,
      { transaction },
    );
    await database.query(
      `CREATE TRIGGER task_attempt_number_${action.toLowerCase()} BEFORE ${action} ON TaskRunAttempts WHEN NEW.attempt_number<1 OR NEW.duration_ms<0 BEGIN SELECT RAISE(ABORT,'TASK_ATTEMPT_FIELDS_INVALID'); END`,
      { transaction },
    );
  }
  await database.query(
    "CREATE TRIGGER worktree_execution_reference_guard BEFORE UPDATE OF lifecycle_state ON Worktrees WHEN NEW.lifecycle_state='DELETING' AND EXISTS(SELECT 1 FROM TaskRuns WHERE worktree_id=NEW.id AND status IN ('RESOLVING','RUNNING','RECOVERY_REQUIRED')) BEGIN SELECT RAISE(ABORT,'WORKTREE_EXECUTION_REFERENCED'); END",
    { transaction },
  );
  await database.query(
    "CREATE TRIGGER task_active_run_delete_guard BEFORE DELETE ON Tasks WHEN EXISTS(SELECT 1 FROM TaskRuns WHERE task_id=OLD.id AND status IN ('QUEUED','RESOLVING','RUNNING','RECOVERY_REQUIRED')) BEGIN SELECT RAISE(ABORT,'TASK_ACTIVE_RUN'); END",
    { transaction },
  );
}
