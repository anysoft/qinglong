const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const setup = require('../phase2/helpers.cjs');
async function fixture(t) {
  const x = await setup(t);
  const S = x.get('data/system');
  await S.SystemModel.sync();
  await x.storage.initialize(x.repo.id);
  const w = await x.worktrees.create({
    repository_id: x.repo.id,
    name: 'editor',
    ref_type: 'branch',
    ref_name: 'main',
  });
  const Service = x.get('services/codeWorkspace').default;
  const service = new Service(x.worktrees);
  t.after(async () => {
    await fs.rm(x.dir + '.platform-control', { recursive: true, force: true });
    await fs.rm(x.dir + '-backups', { recursive: true, force: true });
  });
  return { ...x, w, service };
}
const rejects = (fn, code) => assert.rejects(fn, (e) => e.error_code === code);
test('real Git literal paths, status, bounded diff, stage/unstage and explicit author commit', async (t) => {
  const x = await fixture(t),
    { service: s, w } = x;
  for (const p of ['--evil', 'a b', 'a;b', '$(x)', '中文.ts'])
    await s.mutate(w.id, 'create', {
      path: p,
      content: 'one\n',
      must_not_exist: true,
    });
  assert.equal((await s.status(w.id)).untracked, 5);
  await s.stage(w.id, ['--evil', 'a b', 'a;b', '$(x)', '中文.ts']);
  assert.equal((await s.status(w.id)).staged, 5);
  await s.stage(w.id, ['--evil'], true);
  assert.equal((await s.status(w.id)).staged, 4);
  await rejects(() => s.commit(w.id, 'test'), 'GIT_IDENTITY_REQUIRED');
  await s.setIdentity({
    name: 'Workspace Tester',
    email: 'workspace@example.invalid',
  });
  await rejects(
    () => s.setIdentity({ name: 'Bad\nName', email: 'bad' }),
    'GIT_IDENTITY_REQUIRED',
  );
  const commit = await s.commit(w.id, '中文 commit\n\nbody');
  assert.match(commit.sha, /^[a-f0-9]{40}$/);
  assert.equal(
    x.local(w.local_path, 'show', '-s', '--format=%an <%ae>'),
    'Workspace Tester <workspace@example.invalid>',
  );
  await rejects(() => s.commit(w.id, 'nothing'), 'GIT_NOTHING_TO_COMMIT');
  await rejects(() => s.commit(w.id, ''), 'GIT_COMMIT_MESSAGE_INVALID');
  await rejects(
    () => s.commit(w.id, 'x'.repeat(8193)),
    'GIT_COMMIT_MESSAGE_INVALID',
  );
  const old = await s.read(w.id, 'a b');
  await s.mutate(w.id, 'save', {
    path: 'a b',
    content: 'two\n',
    expected_hash: old.hash,
  });
  assert.match((await s.diff(w.id, 'a b')).text, /two/);
  await s.stage(w.id, ['a b']);
  assert.match((await s.diff(w.id, 'a b', true)).text, /two/);
  assert.equal((await s.diff(w.id, 'a b')).text, '');
  await fs.writeFile(
    path.join(w.local_path, 'a b'),
    'x'.repeat(10 * 1024 * 1024),
  );
  const large = await s.diff(w.id, 'a b');
  assert.equal(large.truncated, true);
  assert.ok(Buffer.byteLength(large.text) <= 256 * 1024);
});
test('real local origin push success, non-fast-forward and credential write capability', async (t) => {
  const x = await fixture(t),
    s = x.service;
  const cred = await x.credentials.save({
    name: 'write',
    provider: 'generic',
    auth_type: 'https_token',
    token: 'phase12-secret-canary',
    capability: 'WRITE',
  });
  await x.repositories.save({ id: x.repo.id, default_credential_id: cred.id });
  x.git('config', 'receive.denyCurrentBranch', 'updateInstead');
  await s.setIdentity({ name: 'Author', email: 'author@example.invalid' });
  await s.mutate(x.w.id, 'create', {
    path: 'new.py',
    content: 'print(1)\n',
    must_not_exist: true,
  });
  await s.stage(x.w.id, ['new.py']);
  const commit = await s.commit(x.w.id, 'editor commit');
  await s.push(x.w.id);
  assert.equal(x.git('rev-parse', 'HEAD'), commit.sha);
  await fs.writeFile(path.join(x.origin, 'remote'), 'remote');
  x.git('add', '.');
  x.git('commit', '-qm', 'remote commit');
  await s.mutate(x.w.id, 'create', {
    path: 'local',
    content: 'local',
    must_not_exist: true,
  });
  await s.stage(x.w.id, ['local']);
  await s.commit(x.w.id, 'local commit');
  await rejects(() => s.push(x.w.id), 'GIT_PUSH_NON_FAST_FORWARD');
  await x.credentials.save({
    id: cred.id,
    name: 'read',
    provider: 'generic',
    auth_type: 'https_token',
    capability: 'READ',
  });
  await assert.rejects(() => s.push(x.w.id), /does not permit push/);
});
test('actual execution lock and recovery journals block reads and mutations', async (t) => {
  const x = await fixture(t);
  const lease = await x.worktrees.acquireExecutionLease(x.w.id, {
    owner_type: 'test',
    owner_id: '1',
  });
  try {
    await rejects(() => x.service.read(x.w.id, 'file.txt'), 'WORKTREE_BUSY');
    await rejects(
      () =>
        x.service.mutate(x.w.id, 'create', {
          path: 'blocked',
          content: '',
          must_not_exist: true,
        }),
      'WORKTREE_BUSY',
    );
  } finally {
    await lease.release();
  }
  assert.equal((await x.service.read(x.w.id, 'file.txt')).content, 'initial\n');
  const key = require('node:crypto')
    .createHash('sha256')
    .update(`worktree:${x.w.id}`)
    .digest('hex');
  await fs.mkdir(
    path.join(x.dir, 'tmp/config-materialization', key, 'run-test'),
    { recursive: true },
  );
  await rejects(
    () => x.service.read(x.w.id, 'file.txt'),
    'WORKSPACE_RECOVERY_REQUIRED',
  );
});
test('5k Git changes paginate without full response', async (t) => {
  const x = await fixture(t);
  for (let n = 0; n < 5000; n += 100)
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        fs.writeFile(path.join(x.w.local_path, 'change-' + (n + i)), ''),
      ),
    );
  const status = await x.service.status(x.w.id, 0, 100);
  assert.equal(status.total, 5000);
  assert.equal(status.changed_files.length, 100);
  assert.equal(status.next, 100);
  console.log(
    JSON.stringify({
      phase12: 'git-scale',
      changes: status.total,
      response_bytes: JSON.stringify(status).length,
      rss: process.memoryUsage().rss,
    }),
  );
});
test('separate process Execution, GitSync, editor and Backup ownership block editor writes', async (t) => {
  const { spawn } = require('node:child_process'),
    x = await fixture(t),
    s = x.service;
  async function worker(kind, root, id) {
    const cp = spawn(
      process.execPath,
      [
        path.resolve('tests/phase12/lease-worker.cjs'),
        kind,
        root,
        String(id || ''),
      ],
      {
        env: { ...process.env, QL_DIR: process.cwd(), QL_DATA_DIR: x.dir },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let err = '';
    cp.stderr.on('data', (b) => (err += b));
    await new Promise((resolve, reject) => {
      cp.stdout.once('data', () => resolve());
      cp.once('exit', (code) => reject(new Error('worker ' + code + err)));
    });
    return async () => {
      cp.stdin.write('release\n');
      await new Promise((r) => cp.once('close', r));
    };
  }
  for (const kind of ['EXECUTION', 'SUBSCRIPTION_SYNC', 'CODE_WORKSPACE']) {
    const release = await worker(kind, x.dir, x.w.id);
    try {
      await rejects(
        () =>
          s.mutate(x.w.id, 'create', {
            path: 'held',
            content: '',
            must_not_exist: true,
          }),
        'WORKTREE_BUSY',
      );
    } finally {
      await release();
    }
  }
  const { platformBarrier } = x.get('services/backup/platform'),
    barrier = await platformBarrier();
  const release = await worker('backup', barrier.controlRoot);
  try {
    await assert.rejects(
      () =>
        s.mutate(x.w.id, 'create', {
          path: 'held',
          content: '',
          must_not_exist: true,
        }),
      /PLATFORM_BACKUP_IN_PROGRESS/,
    );
  } finally {
    await release();
  }
  const releaseEditor = await worker('CODE_WORKSPACE', x.dir, x.w.id);
  let captured = false;
  const pending = barrier.snapshot(
    async () => true,
    async () => {
      captured = true;
    },
    5000,
  );
  pending.catch(() => {});
  await new Promise(async (resolve, reject) => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if ((await barrier.state())?.phase === 'QUIESCING') {
        resolve();
        return;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    reject(Error('no QUIESCING'));
  });
  assert.equal(captured, false);
  await assert.rejects(
    () =>
      s.mutate(x.w.id, 'create', {
        path: 'quiescing',
        content: '',
        must_not_exist: true,
      }),
    /PLATFORM_BACKUP_IN_PROGRESS/,
  );
  await releaseEditor();
  await pending;
  assert.equal(captured, true);
  const marker = path.join(barrier.controlRoot, 'barrier.json');
  await fs.writeFile(
    marker,
    JSON.stringify({
      version: 1,
      id: require('node:crypto').randomUUID(),
      phase: 'RESTORE_PENDING',
    }),
    { mode: 0o600 },
  );
  try {
    for (const action of [
      () =>
        s.mutate(x.w.id, 'save', {
          path: 'file.txt',
          content: 'x',
          expected_hash: 'a'.repeat(64),
        }),
      () =>
        s.mutate(x.w.id, 'create', {
          path: 'new',
          content: '',
          must_not_exist: true,
        }),
      () =>
        s.mutate(x.w.id, 'remove', {
          path: 'file.txt',
          expected_hash: 'a'.repeat(64),
        }),
      () => s.commit(x.w.id, 'pending'),
      () => s.push(x.w.id),
    ])
      await assert.rejects(action, /PLATFORM_BACKUP_IN_PROGRESS/);
  } finally {
    await fs.unlink(marker);
  }
  await s.mutate(x.w.id, 'create', {
    path: 'after',
    content: 'allowed',
    must_not_exist: true,
  });
});
test('Git deletion beneath missing parent, rename, binary diff and literal wildcard pathspecs', async (t) => {
  const x = await fixture(t),
    s = x.service,
    id = x.w.id;
  await s.setIdentity({ name: 'Fixture', email: 'fixture@example.invalid' });
  await s.mutate(id, 'mkdir', { path: 'folder' });
  await s.mutate(id, 'create', {
    path: 'folder/tracked',
    content: 'source\n',
    must_not_exist: true,
  });
  await s.stage(id, ['folder/tracked']);
  await s.commit(id, 'source');
  await s.mutate(id, 'rename', {
    path: 'folder/tracked',
    destination: 'folder/renamed',
    expected_hash: (await s.read(id, 'folder/tracked')).hash,
  });
  await s.stage(id, ['folder/tracked', 'folder/renamed']);
  assert.equal(
    (await s.status(id)).changed_files.find((f) => f.path === 'folder/renamed')
      .index,
    'R',
  );
  await s.commit(id, 'rename');
  await s.mutate(id, 'remove', {
    path: 'folder/renamed',
    expected_hash: (await s.read(id, 'folder/renamed')).hash,
  });
  const tree = await s.tree(id, '', 0, 100);
  await s.mutate(id, 'remove', {
    path: 'folder',
    expected_hash: tree.items.find((f) => f.name === 'folder').identity,
  });
  await s.stage(id, ['folder/renamed']);
  assert.equal((await s.status(id)).changed_files[0].index, 'D');
  await fs.writeFile(
    path.join(x.w.local_path, 'file.txt'),
    Buffer.from([0, 1, 2]),
  );
  assert.equal((await s.diff(id, 'file.txt')).binary, true);
  for (const p of ['[x]*.txt', 'x-other.txt'])
    await s.mutate(id, 'create', {
      path: p,
      content: 'literal',
      must_not_exist: true,
    });
  await s.stage(id, ['[x]*.txt']);
  const state = await s.status(id);
  assert.equal(
    state.changed_files.find((f) => f.path === '[x]*.txt').index,
    'A',
  );
  assert.equal(
    state.changed_files.find((f) => f.path === 'x-other.txt').index,
    '?',
  );
});
test('Git conflicts reject commit and unborn unstage preserves subsequently edited content', async (t) => {
  const x = await fixture(t),
    s = x.service,
    id = x.w.id;
  await s.setIdentity({ name: 'Fixture', email: 'fixture@example.invalid' });
  x.local(x.w.local_path, 'checkout', '-b', 'fixture-side');
  await fs.writeFile(path.join(x.w.local_path, 'file.txt'), 'side\n');
  x.local(x.w.local_path, 'commit', '-am', 'side');
  x.local(x.w.local_path, 'checkout', x.w.branch);
  await fs.writeFile(path.join(x.w.local_path, 'file.txt'), 'main\n');
  x.local(x.w.local_path, 'commit', '-am', 'main');
  assert.throws(() => x.local(x.w.local_path, 'merge', 'fixture-side'));
  assert.equal((await s.status(id)).conflicted, 1);
  await rejects(() => s.commit(id, 'conflict'), 'GIT_CONFLICT');
  // All commands below operate solely on this disposable test repository.
  x.local(x.w.local_path, 'merge', '--abort');
  x.local(x.w.local_path, 'checkout', '--orphan', 'fixture-unborn');
  x.local(x.w.local_path, 'rm', '--cached', '-f', '--', 'file.txt');
  await s.stage(id, ['file.txt']);
  await fs.writeFile(path.join(x.w.local_path, 'file.txt'), 'after stage\n');
  await s.stage(id, ['file.txt'], true);
  assert.equal((await s.status(id)).staged, 0);
  assert.equal(
    await fs.readFile(path.join(x.w.local_path, 'file.txt'), 'utf8'),
    'after stage\n',
  );
});

test('Git stage refuses hardlinks without adding external bytes to the index', async (t) => {
  const x = await fixture(t),
    outside = path.join(x.dir, 'outside-secret');
  await fs.writeFile(outside, 'private fixture');
  await fs.link(outside, path.join(x.w.local_path, 'linked'));
  await rejects(
    () => x.service.stage(x.w.id, ['linked']),
    'WORKSPACE_PATH_FORBIDDEN',
  );
  assert.equal((await x.service.status(x.w.id)).staged, 0);
  await rejects(
    () => x.service.diff(x.w.id, 'linked'),
    'WORKSPACE_PATH_FORBIDDEN',
  );
  await fs.mkdir(path.join(x.w.local_path, 'directory'));
  await rejects(
    () => x.service.diff(x.w.id, 'directory'),
    'WORKSPACE_PATH_FORBIDDEN',
  );
  await fs.symlink(outside, path.join(x.w.local_path, 'external-link'));
  await rejects(
    () => x.service.diff(x.w.id, 'external-link'),
    'WORKSPACE_PATH_FORBIDDEN',
  );
});
