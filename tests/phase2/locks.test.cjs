const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { spawn } = require('node:child_process');
const load = require('../../test/helpers/load-security-module.cjs');
const setup = require('./helpers.cjs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test('cross-process POSIX locks release after owner crash, success and errors', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-lock2-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.resolve(__dirname, '../..'),
    mocks = { '../config': { rootPath: root, dataPath: dir } };
  const { RepositoryPathResolver } = load(
      'back/shared/workspacePaths.ts',
      mocks,
    ),
    { WorkspaceLocks } = load('back/services/workspaceLocks.ts', mocks);
  const locks = new WorkspaceLocks(new RepositoryPathResolver(dir));
  const script = `const load=require(${JSON.stringify(
    path.join(root, 'test/helpers/load-security-module.cjs'),
  )});const mocks={'../config':${JSON.stringify({
    rootPath: root,
    dataPath: dir,
  })}};const{RepositoryPathResolver}=load(${JSON.stringify(
    path.join(root, 'back/shared/workspacePaths.ts'),
  )},mocks);const{WorkspaceLocks}=load(${JSON.stringify(
    path.join(root, 'back/services/workspaceLocks.ts'),
  )},mocks);new WorkspaceLocks(new RepositoryPathResolver(${JSON.stringify(
    dir,
  )})).acquire([{kind:'repository',id:1}],{owner_type:'test',owner_id:'crash',operation:'fetch'}).then(()=>{process.stdout.write('READY\\n');setInterval(()=>{},1000);});`;
  const child = spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill('SIGKILL'));
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('exit', () => reject(new Error('owner exited before lock')));
  });
  await assert.rejects(
    locks.with([{ kind: 'repository', id: 1 }], 'second', async () => {}),
    (e) => e.error_code === 'REPOSITORY_BUSY',
  );
  await locks.with(
    [{ kind: 'repository', id: 2 }],
    'independent',
    async () => {},
  );
  child.kill('SIGKILL');
  let acquired = false;
  for (let i = 0; i < 30 && !acquired; i++) {
    try {
      await locks.with(
        [{ kind: 'repository', id: 1 }],
        'recovery',
        async () => {},
      );
      acquired = true;
    } catch {
      await sleep(100);
    }
  }
  assert.ok(acquired);
  await assert.rejects(
    locks.with([{ kind: 'repository', id: 1 }], 'failure', async () => {
      throw new Error('injected');
    }),
    /injected/,
  );
  await locks.with(
    [{ kind: 'repository', id: 1 }],
    'after-failure',
    async () => {},
  );
});
test('repository mutation matrix and execution lease exclusivity', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const wt = await x.worktrees.create({
    repository_id: x.repo.id,
    name: 'main',
    ref_type: 'branch',
    ref_name: 'main',
  });
  const held = await x.storage.locks.acquire(
    [{ kind: 'repository', id: x.repo.id }],
    { owner_type: 'test', owner_id: 'matrix', operation: 'fetch' },
  );
  try {
    for (const op of [
      () => x.storage.fetch(x.repo.id),
      () =>
        x.worktrees.create({
          repository_id: x.repo.id,
          name: 'dev',
          ref_type: 'branch',
          ref_name: 'dev',
        }),
      () => x.storage.remove(x.repo.id),
      () => x.storage.prune(x.repo.id),
    ])
      await assert.rejects(op(), (e) => e.error_code === 'REPOSITORY_BUSY');
  } finally {
    await held.release();
  }
  const pair = await Promise.allSettled([
    x.storage.fetch(x.repo.id),
    x.storage.fetch(x.repo.id),
  ]);
  assert.equal(pair.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    pair.find((r) => r.status === 'rejected').reason.error_code,
    'REPOSITORY_BUSY',
  );
  const updates = await Promise.allSettled([
    x.worktrees.update(wt.id),
    x.worktrees.update(wt.id),
  ]);
  assert.equal(updates.filter((r) => r.status === 'fulfilled').length, 1);
  const other = await x.worktrees.create({
    repository_id: x.repo.id,
    name: 'dev',
    ref_type: 'branch',
    ref_name: 'dev',
  });
  const lease = await x.worktrees.acquireExecutionLease(wt.id, {
    owner_type: 'test',
    owner_id: 'one',
  });
  try {
    await assert.rejects(
      x.worktrees.acquireExecutionLease(wt.id, {
        owner_type: 'test',
        owner_id: 'two',
      }),
      (e) => e.error_code === 'WORKTREE_BUSY',
    );
    const independent = await x.worktrees.acquireExecutionLease(other.id, {
      owner_type: 'test',
      owner_id: 'other',
    });
    await independent.release();
  } finally {
    await lease.release();
  }
});
test('real Git timeout and controller crash during Git release locks after child termination', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-running-lock-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const root = path.resolve(__dirname, '../..'),
    mocks = { '../config': { rootPath: root, dataPath: dir } };
  const { RepositoryPathResolver } = load(
      'back/shared/workspacePaths.ts',
      mocks,
    ),
    { WorkspaceLocks } = load('back/services/workspaceLocks.ts', mocks);
  const locks = new WorkspaceLocks(new RepositoryPathResolver(dir));
  await locks.with(
    [{ kind: 'repository', id: 1 }],
    'timeout',
    async (guard) => {
      const result = await guard.run(
        ['-c', 'alias.slow=!sleep 30', 'slow'],
        dir,
        process.env,
        50,
      );
      assert.equal(result.code, 124);
    },
  );
  await locks.with(
    [{ kind: 'repository', id: 1 }],
    'after-timeout',
    async () => {},
  );
  const marker = path.join(dir, 'running');
  const script = `const load=require(${JSON.stringify(
    path.join(root, 'test/helpers/load-security-module.cjs'),
  )});const mocks={'../config':${JSON.stringify({
    rootPath: root,
    dataPath: dir,
  })}};const{RepositoryPathResolver}=load(${JSON.stringify(
    path.join(root, 'back/shared/workspacePaths.ts'),
  )},mocks);const{WorkspaceLocks}=load(${JSON.stringify(
    path.join(root, 'back/services/workspaceLocks.ts'),
  )},mocks);new WorkspaceLocks(new RepositoryPathResolver(${JSON.stringify(
    dir,
  )})).with([{kind:'repository',id:1}],'running',g=>g.run(['-c','alias.slow=!echo running > running; sleep 30','slow'],${JSON.stringify(
    dir,
  )},process.env,60000));`;
  const child = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
  t.after(() => child.kill('SIGKILL'));
  let started = false;
  for (let i = 0; i < 100 && !started; i++) {
    started = await fs.stat(marker).then(
      () => true,
      () => false,
    );
    if (!started) await sleep(50);
  }
  assert.ok(started);
  assert.equal((await locks.probe('repository', 1)).busy, true);
  child.kill('SIGKILL');
  let recovered = false;
  for (let i = 0; i < 50 && !recovered; i++) {
    recovered = !(await locks.probe('repository', 1)).busy;
    if (!recovered) await sleep(100);
  }
  assert.ok(recovered);
  await locks.with(
    [{ kind: 'repository', id: 1 }],
    'recovered',
    async () => {},
  );
});
