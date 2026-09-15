const test = require('node:test'), assert = require('node:assert/strict');
const { Sequelize, QueryTypes } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
const { migrateScopedEnvironment } = load('back/shared/scopedEnvMigration.ts');
async function fixture(t) {
  const db = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false }); t.after(() => db.close());
  for (const table of ['Repositories', 'Subscriptions', 'Crontabs', 'Envs']) { await db.query(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY, name TEXT)`); await db.query(`INSERT INTO ${table} VALUES(1,'keep')`); }
  await db.query('CREATE TABLE SchemaMigrations(id TEXT PRIMARY KEY, applied_at TEXT)'); return db;
}
test('Phase 3 upgrade is additive, idempotent and indexed, with nullable bindings and unchanged globals', async t => {
  const db = await fixture(t); await db.transaction(tx => migrateScopedEnvironment(db, tx)); await db.transaction(tx => migrateScopedEnvironment(db, tx));
  for (const [table, key] of [['Repositories', 'default_env_profile_id'], ['Subscriptions', 'env_profile_id'], ['Crontabs', 'env_profile_id']]) {
    const [rows] = await db.query(`SELECT * FROM ${table}`); assert.equal(rows[0].name, 'keep'); assert.equal(rows[0][key], null);
  }
  assert.deepEqual((await db.query('SELECT * FROM Envs'))[0], [{ id: 1, name: 'keep' }]);
  assert.equal((await db.query('SELECT * FROM SchemaMigrations'))[0].length, 1);
  for (const [table, key] of [['EnvironmentProfiles', 'repository_id'], ['RepositoryEnvVariables', 'profile_id'], ['TaskEnvVariables', 'cron_id']]) {
    const plan = await db.query(`EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE ${key}=1`, { type: QueryTypes.SELECT });
    assert.match(JSON.stringify(plan), /USING INDEX/);
  }
  await assert.rejects(db.query('UPDATE Crontabs SET env_profile_id=999'));
});
test('failed DDL rolls back tables, references and ledger, then safely retries', async t => {
  const db = await fixture(t), query = db.query.bind(db);
  db.query = (sql, ...args) => { if (sql.includes('ALTER TABLE Crontabs')) throw new Error('injected'); return query(sql, ...args); };
  await assert.rejects(db.transaction(tx => migrateScopedEnvironment(db, tx)), /injected/); db.query = query;
  assert.ok(!(await db.getQueryInterface().showAllTables()).includes('EnvironmentProfiles'));
  await db.transaction(tx => migrateScopedEnvironment(db, tx));
});
