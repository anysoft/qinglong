const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
process.env.TS_NODE_PROJECT = path.resolve('back/tsconfig.json');
require('ts-node/register/transpile-only');
const configFile = require.resolve('../../back/config/index.ts');
require.cache[configFile] = {
  id: configFile,
  filename: configFile,
  loaded: true,
  exports: {
    __esModule: true,
    default: { rootPath: path.resolve(), dataPath: '' },
  },
};
const {
  PlatformBackupBarrier,
} = require('../../back/services/backup/barrier.ts');
async function setup(t) {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'phase14-barrier-'),
  );
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return new PlatformBackupBarrier(root);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
test('barrier blocks producers, permits existing queue drain, waits for shared writers, releases on timeout', async (t) => {
  const gate = await setup(t),
    peer = new PlatformBackupBarrier(gate.controlRoot);
  let release, entered;
  const started = new Promise((r) => (entered = r)),
    hold = new Promise((r) => (release = r));
  const writer = peer.mutation(async () => {
    entered();
    await hold;
  });
  await started;
  const snapshot = gate.snapshot(
    async () => true,
    async () => assert.fail('snapshot while active writer'),
    150,
  );
  await delay(40);
  await assert.rejects(
    peer.mutation(async () => {}),
    /PLATFORM_BACKUP_IN_PROGRESS/,
  );
  await peer.mutation(async () => {}, true);
  await assert.rejects(snapshot, /BACKUP_BUSY/);
  assert.equal(await gate.state(), null);
  release();
  await writer;
  await gate.snapshot(
    async () => true,
    async () => {
      assert.equal((await peer.state()).phase, 'SNAPSHOTTING');
      await assert.rejects(
        peer.mutation(async () => {}, true),
        /PLATFORM_BACKUP_IN_PROGRESS/,
      );
    },
  );
  assert.equal(await gate.state(), null);
});
test('barrier rechecks idle under exclusive lock and retains business work on busy timeout', async (t) => {
  const gate = await setup(t);
  let called = 0;
  await gate.snapshot(
    async () => ++called > 1,
    async () => {
      assert.ok(called >= 3);
    },
  );
  await assert.rejects(
    gate.snapshot(
      async () => false,
      async () => assert.fail(),
      30,
    ),
    /BACKUP_BUSY/,
  );
  assert.equal(await gate.state(), null);
  await assert.rejects(
    gate.snapshot(
      async () => true,
      async () => {
        throw Error('fixture failure');
      },
    ),
    /fixture failure/,
  );
  await gate.mutation(async () => {});
});
test('independent process SIGKILL leaves fail-closed marker and releases FD lock for deterministic recovery', async (t) => {
  const { fork } = require('node:child_process'),
    gate = await setup(t);
  const child = fork(
    path.resolve('tests/phase14/barrier-worker.cjs'),
    [gate.controlRoot],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  let stderr = '';
  child.stderr.on('data', (b) => (stderr += b));
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  await new Promise((resolve, reject) => {
    child.once('message', resolve);
    child.once('exit', () => reject(Error('worker failed: ' + stderr)));
  });
  await assert.rejects(
    gate.mutation(async () => {}),
    /PLATFORM_BACKUP_IN_PROGRESS/,
  );
  const exited = new Promise((r) => child.once('exit', r));
  child.kill('SIGKILL');
  await exited;
  assert.equal((await gate.state()).phase, 'SNAPSHOTTING');
  await assert.rejects(
    gate.mutation(async () => {}),
    /PLATFORM_BACKUP_IN_PROGRESS/,
  );
  await gate.recoverAbandonedSnapshot();
  assert.equal(await gate.state(), null);
  await gate.mutation(async () => {});
});
