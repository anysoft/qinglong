const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize, QueryTypes } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
const { migrateSchema } = load(
  require('node:path').resolve('back/shared/schemaMigrations.ts'),
);
async function legacy() {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });
  for (const table of ['CrontabViews', 'Subscriptions', 'Crontabs', 'Envs'])
    await db.query(`CREATE TABLE "${table}" (id INTEGER PRIMARY KEY)`);
  await db.query('INSERT INTO Subscriptions(id) VALUES (17)');
  return db;
}
test('Phase1 migration is additive, preserves rows and nullable legacy references, idempotent', async (t) => {
  const db = await legacy();
  t.after(() => db.close());
  await migrateSchema(db);
  await migrateSchema(db);
  const rows = await db.query(
    'SELECT id, repository_id, credential_id FROM Subscriptions',
    { type: QueryTypes.SELECT },
  );
  assert.deepEqual(rows, [
    { id: 17, repository_id: null, credential_id: null },
  ]);
  const tables = await db.getQueryInterface().showAllTables();
  assert.ok(tables.includes('GitCredentials'));
  assert.ok(tables.includes('Repositories'));
});
test('Phase1 schema and columns roll back together after an injected failure', async (t) => {
  const db = await legacy();
  t.after(() => db.close());
  const query = db.query.bind(db);
  db.query = async (sql, ...args) => {
    if (String(sql).includes('ALTER TABLE "Envs"'))
      throw new Error('injected migration failure');
    return query(sql, ...args);
  };
  await assert.rejects(migrateSchema(db));
  db.query = query;
  const columns = await db.query('PRAGMA table_info("Subscriptions")', {
    type: QueryTypes.SELECT,
  });
  assert.deepEqual(
    columns.map((x) => x.name),
    ['id'],
  );
  assert.equal(
    (await db.getQueryInterface().showAllTables()).includes('GitCredentials'),
    false,
  );
  await migrateSchema(db);
});
