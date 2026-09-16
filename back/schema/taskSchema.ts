import platformV6 from './platformV6';
import {
  Sequelize,
  Transaction,
  QueryTypes,
  Model,
  ModelStatic,
} from 'sequelize';
import platformV5 from './platformV5';
import { relativeTaskPath, taskLanguage } from '../shared/taskDefinition';

// Frozen v5 tables not owned by Task retain their exact DDL. These substitutions
// describe schema evolution, never a source-code symbol rename.
const renameTable: Record<string, string> = {
  Crontabs: 'SchedulerProjections',
  CrontabStats: 'TaskStats',
  CrontabViews: 'TaskViews',
};
const childTables = ['TaskEnvVariables', 'TaskConfigBindings', 'TaskHooks'];
function evolvedObject(object: { name: string; sql: string }) {
  let sql = object.sql,
    name = renameTable[object.name] ?? object.name;
  if (object.name === 'Crontabs') {
    sql = sql
      .replace('`Crontabs`', '`SchedulerProjections`')
      .replace(
        'INTEGER PRIMARY KEY AUTOINCREMENT',
        'INTEGER PRIMARY KEY REFERENCES Tasks(id) ON DELETE CASCADE',
      );
  } else if (childTables.includes(object.name)) {
    sql = sql.replace(/REFERENCES `Crontabs`/g, 'REFERENCES `Tasks`');
    if (object.name === 'TaskEnvVariables')
      sql = sql.replace(/`cron_id`/g, '`task_id`');
  } else if (object.name === 'RunningInstances')
    sql = sql.replace(/`cron_id`/g, '`task_id`');
  for (const [oldName, newName] of Object.entries(renameTable))
    if (oldName !== 'Crontabs')
      sql = sql.replaceAll('`' + oldName + '`', '`' + newName + '`');
  if (object.sql.startsWith('CREATE') && object.sql.includes('INDEX')) {
    if (object.name.startsWith('crontab_stats_')) {
      name = object.name.replace('crontab_stats_', 'task_stats_');
      sql = sql.replace('`' + object.name + '`', '`' + name + '`');
    }
    if (object.name === 'task_env_variables_cron_id_name') {
      name = 'task_env_variables_task_id_name';
      sql = sql
        .replace('`' + object.name + '`', '`' + name + '`')
        .replace('`cron_id`', '`task_id`');
    }
  }
  if (
    sql.startsWith('CREATE TABLE') &&
    [
      ...Object.values(renameTable),
      ...childTables,
      'RunningInstances',
    ].includes(name)
  )
    sql = sql.replace('`' + name + '`', '"' + name + '"');
  return { name, sql };
}
export const taskPlatformObjects = platformV5.objects
  .filter((o) => o.name !== 'PlatformMetadata')
  .map(evolvedObject);

const constraints = [
  `CREATE TRIGGER task_identity_insert BEFORE INSERT ON Tasks WHEN NEW.origin NOT IN ('MANUAL','DISCOVERED') OR (NEW.origin='MANUAL' AND (NEW.subscription_id IS NOT NULL OR NEW.discovery_key IS NOT NULL)) OR (NEW.origin='DISCOVERED' AND (NEW.subscription_id IS NULL OR NEW.discovery_key IS NULL)) BEGIN SELECT RAISE(ABORT,'TASK_IDENTITY_INVALID'); END`,
  `CREATE TRIGGER task_identity_update BEFORE UPDATE OF origin,subscription_id,discovery_key ON Tasks WHEN NEW.origin IS NOT OLD.origin OR NEW.subscription_id IS NOT OLD.subscription_id OR NEW.discovery_key IS NOT OLD.discovery_key BEGIN SELECT RAISE(ABORT,'TASK_IDENTITY_IMMUTABLE'); END`,
  `CREATE TRIGGER task_source_owner_insert BEFORE INSERT ON TaskSources WHEN EXISTS(SELECT 1 FROM Tasks t JOIN Subscriptions s ON s.id=t.subscription_id WHERE t.id=NEW.task_id AND s.worktree_id IS NOT NEW.worktree_id) BEGIN SELECT RAISE(ABORT,'TASK_WORKTREE_OWNER_MISMATCH'); END`,
  `CREATE TRIGGER task_source_owner_update BEFORE UPDATE ON TaskSources WHEN EXISTS(SELECT 1 FROM Tasks t JOIN Subscriptions s ON s.id=t.subscription_id WHERE t.id=NEW.task_id AND s.worktree_id IS NOT NEW.worktree_id) BEGIN SELECT RAISE(ABORT,'TASK_WORKTREE_OWNER_MISMATCH'); END`,
  ...['INSERT', 'UPDATE'].map(
    (action) =>
      `CREATE TRIGGER task_source_available_${action.toLowerCase()} BEFORE ${action} ON TaskSources WHEN EXISTS(SELECT 1 FROM Worktrees WHERE id=NEW.worktree_id AND lifecycle_state='DELETING') BEGIN SELECT RAISE(ABORT,'TASK_WORKTREE_DELETING'); END`,
  ),
  ...['TaskRuntimeBindings', 'RuntimeDefaults'].flatMap((table) =>
    ['INSERT', 'UPDATE'].map(
      (action) =>
        `CREATE TRIGGER ${table}_runtime_${action.toLowerCase()} BEFORE ${action} ON ${table} WHEN NEW.kind NOT IN ('SHELL','PYTHON','NODE') OR (NEW.kind<>'PYTHON' AND NEW.python_environment_id IS NOT NULL) OR (NEW.kind<>'NODE' AND NEW.node_environment_id IS NOT NULL) OR EXISTS(SELECT 1 FROM PythonEnvironments WHERE id=NEW.python_environment_id AND state='DELETING') OR EXISTS(SELECT 1 FROM NodeEnvironments WHERE id=NEW.node_environment_id AND state='DELETING') BEGIN SELECT RAISE(ABORT,'TASK_RUNTIME_BINDING_INVALID'); END`,
    ),
  ),
  ...['INSERT', 'UPDATE'].map(
    (action) =>
      `CREATE TRIGGER runtime_default_owner_${action.toLowerCase()} BEFORE ${action} ON RuntimeDefaults WHEN (NEW.repository_id IS NULL)=(NEW.subscription_id IS NULL) OR NEW.kind NOT IN ('PYTHON','NODE') OR (NEW.kind='PYTHON' AND NEW.python_environment_id IS NULL) OR (NEW.kind='NODE' AND NEW.node_environment_id IS NULL) BEGIN SELECT RAISE(ABORT,'RUNTIME_DEFAULT_INVALID'); END`,
  ),
];
const referenceGuards = [
  `CREATE TRIGGER worktree_task_reference_guard BEFORE UPDATE OF lifecycle_state ON Worktrees WHEN NEW.lifecycle_state='DELETING' AND EXISTS(SELECT 1 FROM TaskSources WHERE worktree_id=NEW.id) BEGIN SELECT RAISE(ABORT,'WORKTREE_TASK_REFERENCED'); END`,
  ...[
    ['PythonEnvironments', 'python_environment_id'],
    ['NodeEnvironments', 'node_environment_id'],
  ].map(
    ([table, key]) =>
      `CREATE TRIGGER ${table}_task_reference_guard BEFORE UPDATE OF state ON ${table} WHEN NEW.state='DELETING' AND (EXISTS(SELECT 1 FROM TaskRuntimeBindings WHERE ${key}=NEW.id) OR EXISTS(SELECT 1 FROM RuntimeDefaults WHERE ${key}=NEW.id)) BEGIN SELECT RAISE(ABORT,'ENVIRONMENT_TASK_REFERENCED'); END`,
  ),
];
/** Shared by fresh and migrated databases. No Crontabs table is created on fresh install. */
export async function createTaskDomainSchema(
  database: Sequelize,
  transaction: Transaction,
  models: ModelStatic<Model>[],
) {
  for (const name of [
    'Tasks',
    'TaskSources',
    'TaskRuntimeBindings',
    'TaskExecutionSettings',
    'RuntimeDefaults',
  ]) {
    for (const object of [...platformV6.objects]
      .sort(
        (a, b) =>
          Number(!a.sql.startsWith('CREATE TABLE')) -
          Number(!b.sql.startsWith('CREATE TABLE')),
      )
      .filter(
        (o) =>
          o.name === name ||
          (o.sql.startsWith('CREATE') &&
            o.sql.includes('INDEX') &&
            o.sql.includes('ON `' + name + '`')),
      ))
      await database.query(object.sql, { transaction });
  }
  for (const statement of constraints)
    await database.query(statement, { transaction });
}
export async function createFreshTaskPlatform(
  database: Sequelize,
  transaction: Transaction,
  models: ModelStatic<Model>[],
) {
  await createTaskDomainSchema(database, transaction, models);
  for (const object of [...taskPlatformObjects].sort(
    (a, b) =>
      Number(!a.sql.startsWith('CREATE TABLE')) -
      Number(!b.sql.startsWith('CREATE TABLE')),
  ))
    await database.query(object.sql, { transaction });
  for (const statement of referenceGuards)
    await database.query(statement, { transaction });
}
/** v5 only. Caller validates the frozen metadata and owns the IMMEDIATE transaction. */
export async function migrateTaskPlatform(
  database: Sequelize,
  transaction: Transaction,
  models: ModelStatic<Model>[],
) {
  await database.query('PRAGMA defer_foreign_keys=ON', { transaction });
  await createTaskDomainSchema(database, transaction, models);
  const rows = await database.query<any>(
    'SELECT c.*, s.worktree_id FROM Crontabs c LEFT JOIN Subscriptions s ON s.id=c.sub_id ORDER BY c.id',
    { type: QueryTypes.SELECT, transaction },
  );
  for (const row of rows) {
    const discovered = row.sub_id != null && row.discovery_key != null;
    // No command parsing. A command-only definition remains preserved exclusively
    // in SchedulerProjections and requires an explicit source selection.
    const definition = row.discovery_definition
      ? JSON.parse(row.discovery_definition)
      : null;
    await database.query(
      `INSERT INTO Tasks (id,name,description,enabled,origin,subscription_id,discovery_key,discovery_definition,env_profile_id,arguments,schedule,version,createdAt,updatedAt)
      VALUES (:id,:name,'',:enabled,:origin,:subscription,:key,:definition,:profile,'[]',:schedule,1,:created,:updated)`,
      {
        replacements: {
          id: row.id,
          name: row.name ?? `Task ${row.id}`,
          enabled: row.isDisabled !== 1,
          origin: discovered ? 'DISCOVERED' : 'MANUAL',
          subscription: discovered ? row.sub_id : null,
          key: discovered ? row.discovery_key : null,
          definition: definition
            ? JSON.stringify({
                name: definition.name,
                schedule: definition.schedule,
              })
            : null,
          profile: row.env_profile_id,
          schedule: row.schedule,
          created: row.createdAt,
          updated: row.updatedAt,
        },
        transaction,
      },
    );
    if (discovered && row.worktree_id && row.source_relative_path) {
      const entry = relativeTaskPath(row.source_relative_path),
        language = taskLanguage(entry);
      await database.query(
        `INSERT INTO TaskSources (task_id,type,worktree_id,relative_entrypoint,language,cwd_mode,cwd_relative_path,createdAt,updatedAt) VALUES (:id,'WORKTREE_ENTRYPOINT',:worktree,:entry,:language,'ENTRYPOINT_DIR',NULL,:created,:updated)`,
        {
          replacements: {
            id: row.id,
            worktree: row.worktree_id,
            entry,
            language,
            created: row.createdAt,
            updated: row.updatedAt,
          },
          transaction,
        },
      );
      await database.query(
        `INSERT INTO TaskRuntimeBindings (task_id,kind,python_environment_id,node_environment_id,createdAt,updatedAt) VALUES (:id,:kind,NULL,NULL,:created,:updated)`,
        {
          replacements: {
            id: row.id,
            kind:
              language === 'SHELL'
                ? 'SHELL'
                : language === 'PYTHON'
                ? 'PYTHON'
                : 'NODE',
            created: row.createdAt,
            updated: row.updatedAt,
          },
          transaction,
        },
      );
    }
    await database.query(
      `INSERT INTO TaskExecutionSettings (task_id,timeout_seconds,max_attempts,initial_delay_seconds,backoff,concurrency,notification,createdAt,updatedAt) VALUES (:id,NULL,1,0,'FIXED','FORBID','NONE',:created,:updated)`,
      {
        replacements: {
          id: row.id,
          created: row.createdAt,
          updated: row.updatedAt,
        },
        transaction,
      },
    );
  }
  // Copy child data before dropping either parent. No cascading delete touches
  // Task ENV, Config or Hooks, even if a later operation forces rollback.
  for (const oldName of [
    'Crontabs',
    ...childTables,
    'CrontabStats',
    'CrontabViews',
    'RunningInstances',
  ]) {
    const target = renameTable[oldName] ?? oldName;
    const ddl = taskPlatformObjects.find((o) => o.name === target)!.sql;
    const temporary = target + '_phase9';
    await database.query(
      ddl.replace('"' + target + '"', '"' + temporary + '"'),
      { transaction },
    );
    await database.query(
      `INSERT INTO \`${temporary}\` SELECT * FROM \`${oldName}\``,
      { transaction },
    );
    if (oldName !== 'Crontabs') {
      await database.query(`DROP TABLE \`${oldName}\``, { transaction });
      await database.query(
        `ALTER TABLE \`${temporary}\` RENAME TO \`${target}\``,
        { transaction },
      );
    }
  }
  await database.query('DROP TABLE Crontabs', { transaction });
  await database.query(
    'ALTER TABLE SchedulerProjections_phase9 RENAME TO SchedulerProjections',
    { transaction },
  );
  // Resources are declarations only; migrated bindings are initially unbound.
  await database.query('UPDATE SchedulerProjections SET isDisabled=1', {
    transaction,
  });
  const existing = new Set(
    (
      await database.query<{ name: string }>('SELECT name FROM sqlite_master', {
        type: QueryTypes.SELECT,
        transaction,
      })
    ).map((o) => o.name),
  );
  for (const object of taskPlatformObjects)
    if (!existing.has(object.name))
      await database.query(object.sql, { transaction });
  for (const statement of referenceGuards)
    await database.query(statement, { transaction });
}
