const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const load = require('../../test/helpers/load-security-module.cjs');
const { Sequelize } = require('sequelize');
test('managed paths use IDs, reject traversal, symlink escape and case collisions', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-path2-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { RepositoryPathResolver } = load('back/shared/workspacePaths.ts');
  const paths = new RepositoryPathResolver(root);
  const a = await paths.repository({
      id: 1,
      host: 'git.example',
      path: 'Team/Repo',
    }),
    b = await paths.repository({
      id: 2,
      host: 'git.example',
      path: 'team/repo',
    });
  assert.notEqual(a, b);
  assert.match(a, /repository-1\.git$/);
  const wt = await paths.worktree(1, 12);
  assert.match(wt, /repository-1\/wt-12$/);
  await assert.rejects(paths.worktree(1, '../escape'));
  await fs.symlink(os.tmpdir(), path.join(root, 'worktrees/repository-1'));
  await assert.rejects(paths.worktree(1, 13), /PATH_CONFLICT/);
});
test('Phase1 database upgrades atomically and idempotently without changing legacy rows', async (t) => {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });
  t.after(() => db.close());
  for (const table of ['Subscriptions', 'Crontabs', 'Envs', 'CrontabViews'])
    await db.query(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY,name TEXT)`);
  const { migrateSchema } = load('back/shared/schemaMigrations.ts');
  await migrateSchema(db);
  await migrateSchema(db);
  const cols = await db.getQueryInterface().describeTable('Repositories');
  assert.ok(cols.storage_state);
  assert.ok(cols.storage_path);
  const worktree = await db.getQueryInterface().describeTable('Worktrees');
  assert.ok(worktree.repository_id);
  assert.ok(worktree.dirty_state);
  await db.query("INSERT INTO Subscriptions(id,name) VALUES(1,'preserved')");
  await migrateSchema(db);
  assert.equal(
    (
      await db.query('SELECT * FROM Subscriptions', {
        type: Sequelize.QueryTypes.SELECT,
      })
    )[0].name,
    'preserved',
  );
});
test('an existing Phase1 DB rolls back partial Phase2 DDL and preserves resources on retry', async (t) => {
  const db = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });
  t.after(() => db.close());
  for (const table of ['Subscriptions', 'Crontabs', 'Envs', 'CrontabViews'])
    await db.query(`CREATE TABLE ${table}(id INTEGER PRIMARY KEY,name TEXT)`);
  const phase1 = load('back/shared/schemaMigrations.ts', {
    './workspaceMigration': { migrateWorkspace: async () => {} },
  });
  await phase1.migrateSchema(db);
  await db.query(
    "INSERT INTO Repositories(id,name,provider,remote_url,normalized_url,createdAt,updatedAt) VALUES(7,'existing','generic','https://fixture.invalid/team/existing.git','fixture.invalid/team/existing','2026-01-01','2026-01-01')",
  );
  const { migrateSchema } = load('back/shared/schemaMigrations.ts'),
    query = db.query.bind(db);
  db.query = async (sql, ...args) => {
    if (
      typeof sql === 'string' &&
      sql.includes('CREATE TABLE IF NOT EXISTS Worktrees')
    )
      throw new Error('phase2 DDL injected');
    return query(sql, ...args);
  };
  await assert.rejects(migrateSchema(db), /phase2 DDL injected/);
  db.query = query;
  assert.equal(
    (await db.getQueryInterface().describeTable('Repositories')).storage_state,
    undefined,
  );
  await migrateSchema(db);
  await migrateSchema(db);
  const rows = await db.query(
    'SELECT id,name,storage_state FROM Repositories',
    { type: Sequelize.QueryTypes.SELECT },
  );
  assert.deepEqual(rows, [
    { id: 7, name: 'existing', storage_state: 'UNINITIALIZED' },
  ]);
});
