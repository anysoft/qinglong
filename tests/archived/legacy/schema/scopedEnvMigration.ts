import { QueryTypes, Sequelize, Transaction } from 'sequelize';

export async function migrateScopedEnvironment(database: Sequelize, transaction: Transaction) {
  await database.query(`CREATE TABLE IF NOT EXISTS EnvironmentProfiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repository_id INTEGER NOT NULL REFERENCES Repositories(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL, description TEXT DEFAULT '', status VARCHAR(32) NOT NULL DEFAULT 'enabled',
    createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
    UNIQUE(repository_id,name))`, { transaction });
  for (const [table, key, parent] of [
    ['RepositoryEnvVariables', 'profile_id', 'EnvironmentProfiles'],
    ['TaskEnvVariables', 'cron_id', 'Crontabs'],
  ]) {
    await database.query(`CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ${key} INTEGER NOT NULL REFERENCES ${parent}(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL, value TEXT, status VARCHAR(32) NOT NULL DEFAULT 'enabled',
      operation VARCHAR(16) NOT NULL DEFAULT 'SET', is_secret BOOLEAN NOT NULL DEFAULT 0,
      position FLOAT DEFAULT 0, labels JSON DEFAULT '[]', createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
      UNIQUE(${key},name))`, { transaction });
  }
  for (const [table, column] of [['Repositories', 'default_env_profile_id'], ['Subscriptions', 'env_profile_id'], ['Crontabs', 'env_profile_id']]) {
    const fields = await database.query<{ name: string }>(`PRAGMA table_info(${table})`, { type: QueryTypes.SELECT, transaction });
    if (!fields.length) throw new Error(`Migration table is missing: ${table}`);
    if (!fields.some(x => x.name === column)) await database.query(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER REFERENCES EnvironmentProfiles(id) ON DELETE RESTRICT`, { transaction });
    await database.query(`CREATE INDEX IF NOT EXISTS ${table}_env_profile ON ${table}(${column})`, { transaction });
  }
  await database.query("INSERT OR IGNORE INTO SchemaMigrations(id,applied_at) VALUES('phase4-scoped-environment',:at)", { replacements: { at: new Date().toISOString() }, transaction });
}
