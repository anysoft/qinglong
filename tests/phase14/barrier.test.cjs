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
  let idleEntered, finishAdmission;
  const atIdle = new Promise(resolve => idleEntered = resolve);
  const inspected = new Promise(resolve => finishAdmission = resolve);
  const snapshot = gate.snapshot(
    async () => { idleEntered(); await inspected; return true; },
    async () => assert.fail('snapshot while active writer'),
    150,
  );
  snapshot.catch(() => {});
  try {
    // Synchronize with persisted QUIESCING; process startup need not finish within 40ms.
    await Promise.race([atIdle, snapshot.then(() => assert.fail('snapshot finished before admission checks'))]);
    await assert.rejects(
      peer.mutation(async () => {}),
      /PLATFORM_BACKUP_IN_PROGRESS/,
    );
    await peer.mutation(async () => {}, true);
    finishAdmission();
    await assert.rejects(snapshot, /BACKUP_BUSY/);
    assert.equal(await gate.state(), null);
  } finally {
    finishAdmission();
    release();
    await Promise.allSettled([writer, snapshot]);
  }
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
test('detached nested operations retain their own lease after the request returns',async t=>{
 const gate=await setup(t);let release,entered;const ready=new Promise(r=>entered=r),hold=new Promise(r=>release=r);let child;
 await gate.mutation(async()=>{child=gate.mutation(async()=>{entered();await hold;});await ready;});
 await assert.rejects(gate.snapshot(async()=>true,async()=>assert.fail('detached mutation still active'),100),/BACKUP_BUSY/);release();await child;await gate.snapshot(async()=>true,async()=>{});
});
test('inherited process descriptor blocks snapshot after controller releases its lease',async t=>{
 const gate=await setup(t),{spawn}=require('node:child_process'),{inheritedLeaseFds}=require('../../back/services/backup/inheritedLeases.ts');let child;
 await gate.mutation(async()=>{child=spawn(process.execPath,['-e','process.stdout.write("ready");setTimeout(()=>{},900)'],{stdio:['ignore','pipe','ignore',...inheritedLeaseFds()]});await new Promise(r=>child.stdout.once('data',r));});
 const exited=new Promise(r=>child.once('exit',r));await assert.rejects(gate.snapshot(async()=>true,async()=>assert.fail('descendant still owns lease'),100),/BACKUP_BUSY/);await exited;await gate.snapshot(async()=>true,async()=>{});
});
test('HTTP client disconnect does not release an unfinished async route mutation',async t=>{
 const gate=await setup(t),express=require('express'),http=require('node:http'),{protectApiMutations}=require('../../back/services/backup/apiLifetime.ts');let release,entered,finished;const begun=new Promise(r=>entered=r),hold=new Promise(r=>release=r),done=new Promise(r=>finished=r);const app=express(),router=express.Router();router.post('/write',async(_req,res)=>{entered();await hold;await fs.writeFile(path.join(gate.controlRoot,'final-write'),'done');res.end();finished();});app.use(protectApiMutations(router,async()=>gate));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const request=http.request({host:'127.0.0.1',port:server.address().port,path:'/write',method:'POST'});request.on('error',()=>{});request.end();await begun;request.destroy();await delay(20);await assert.rejects(gate.snapshot(async()=>true,async()=>assert.fail('early snapshot'),40),/BACKUP_BUSY/);release();await done;await gate.snapshot(async()=>true,async()=>assert.equal(await fs.readFile(path.join(gate.controlRoot,'final-write'),'utf8'),'done'));assert.equal(await gate.state(),null);
});
