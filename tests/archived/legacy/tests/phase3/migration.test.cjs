const test = require('node:test'),
  assert = require('node:assert/strict'),
  { Sequelize } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
async function database(t) {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });
  t.after(() => db.close());
  await db.query(
    'CREATE TABLE Subscriptions(id INTEGER PRIMARY KEY, name TEXT, repository_id INTEGER)',
  );
  await db.query('CREATE TABLE Worktrees(id INTEGER PRIMARY KEY)');
  await db.query(
    'CREATE TABLE SchemaMigrations(id TEXT PRIMARY KEY,applied_at TEXT)',
  );
  await db.query(
    "INSERT INTO Subscriptions VALUES(1,'manual',NULL),(2,'repository linked',4)",
  );
  return db;
}
test('Phase3 migration is additive and idempotent; both existing subscription types remain Legacy', async (t) => {
  const db = await database(t),
    { migrateManagedSubscriptions: migrate } = load(
      'back/shared/managedSubscriptionMigration.ts',
    );
  await db.transaction((tx) => migrate(db, tx));
  await db.transaction((tx) => migrate(db, tx));
  const [rows] = await db.query('SELECT * FROM Subscriptions');
  assert.deepEqual(
    rows.map((r) => [r.id, r.git_mode, r.worktree_id]),
    [
      [1, 'LEGACY', null],
      [2, 'LEGACY', null],
    ],
  );
  assert.equal((await db.query('SELECT * FROM SchemaMigrations'))[0].length, 1);
  await assert.rejects(
    db.query('UPDATE Subscriptions SET worktree_id=999 WHERE id=1'),
  );
});
test('failed Phase3 DDL rolls back all added columns and can retry', async (t) => {
  const db = await database(t),
    { migrateManagedSubscriptions: migrate } = load(
      'back/shared/managedSubscriptionMigration.ts',
    );
  const query = db.query.bind(db);
  db.query = async (sql, ...args) => {
    if (sql.includes('ADD COLUMN "last_sync_error"'))
      throw new Error('fault injection');
    return query(sql, ...args);
  };
  await assert.rejects(db.transaction((tx) => migrate(db, tx)));
  db.query = query;
  assert.equal(
    (await db.getQueryInterface().describeTable('Subscriptions')).git_mode,
    undefined,
  );
  await db.transaction((tx) => migrate(db, tx));
  assert.ok(
    (await db.getQueryInterface().describeTable('Subscriptions')).git_mode,
  );
});
