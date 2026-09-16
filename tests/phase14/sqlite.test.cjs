const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  sqlite = require('sqlite3');
process.env.TS_NODE_PROJECT = path.resolve('back/tsconfig.json');
require('ts-node/register/transpile-only');
const {
  snapshotDatabase,
  validateDatabase,
  backupDatabase,
} = require('../../back/services/backup/sqlite.ts');
test('SQLite WAL snapshot is self-contained, consistent and FK verified', async (t) => {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'phase14-db-'),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.sqlite'),
    target = path.join(root, 'snapshot.sqlite');
  const db = await new Promise((resolve, reject) => {
    const d = new sqlite.Database(source, (e) => (e ? reject(e) : resolve(d)));
  });
  await fs.chmod(source, 0o600);
  const exec = (sql) =>
    new Promise((r, j) => db.exec(sql, (e) => (e ? j(e) : r())));
  await exec(
    'PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; PRAGMA foreign_keys=ON; CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(parent INTEGER REFERENCES p(id)); INSERT INTO p VALUES(1); INSERT INTO c VALUES(1);',
  );
  assert.ok((await fs.stat(source + '-wal')).size > 0);
  assert.deepEqual(await snapshotDatabase(source, target), {
    integrity: 'ok',
    foreign_keys: 0,
  });
  await exec('INSERT INTO p VALUES(2);');
  await new Promise((r, j) => db.close((e) => (e ? j(e) : r())));
  await fs.unlink(source);
  await assert.rejects(fs.stat(target + '-wal'), { code: 'ENOENT' });
  const copy = await backupDatabase(target);
  assert.equal((await copy.all('SELECT COUNT(*) AS n FROM p'))[0].n, 1);
  await copy.close();
  await assert.rejects(
    snapshotDatabase(target, target),
    /BACKUP_DESTINATION_EXISTS/,
  );
  assert.deepEqual(await validateDatabase(target), {
    integrity: 'ok',
    foreign_keys: 0,
  });
});
test('SQLite foreign key violation fails validation without modifying database', async (t) => {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'phase14-db-invalid-'),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'invalid.sqlite');
  const db = await new Promise((r) => {
    const d = new sqlite.Database(file, () => r(d));
  });
  await new Promise((r, j) =>
    db.exec(
      'CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(parent INTEGER REFERENCES p(id)); INSERT INTO c VALUES(1);',
      (e) => (e ? j(e) : r()),
    ),
  );
  await new Promise((r) => db.close(r));
  await fs.chmod(file, 0o600);
  const before = await fs.readFile(file);
  await assert.rejects(
    validateDatabase(file),
    /BACKUP_DATABASE_INTEGRITY_FAILED/,
  );
  assert.deepEqual(await fs.readFile(file), before);
});
