const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const setup = require('./helpers.cjs');
const create = (x, ref_name = 'main', ref_type = 'branch') =>
  x.worktrees.create({
    repository_id: x.repo.id,
    name: ref_name,
    ref_type,
    ref_name,
  });
test('bare initialization is persistent; fetch updates/prunes remote refs and uses current credentials', async (t) => {
  const x = await setup(t);
  assert.equal(x.repo.storage_state, 'UNINITIALIZED');
  const first = await x.storage.initialize(x.repo.id);
  assert.equal(first.storage_state, 'READY');
  assert.equal(
    x.local(first.storage_path, 'rev-parse', '--is-bare-repository'),
    'true',
  );
  await fs.writeFile(path.join(first.storage_path, 'sentinel'), 'preserve');
  await x.storage.initialize(x.repo.id);
  assert.equal(
    await fs.readFile(path.join(first.storage_path, 'sentinel'), 'utf8'),
    'preserve',
  );
  const a = await x.credentials.save({
      name: 'A',
      provider: 'generic',
      auth_type: 'https_token',
      token: 'secret-one',
    }),
    b = await x.credentials.save({
      name: 'B',
      provider: 'generic',
      auth_type: 'https_token',
      token: 'secret-two',
    });
  await x.repositories.save({ id: x.repo.id, default_credential_id: a.id });
  await x.storage.fetch(x.repo.id);
  await x.repositories.save({ id: x.repo.id, default_credential_id: b.id });
  await fs.writeFile(path.join(x.origin, 'file.txt'), 'remote\n');
  x.git('commit', '-am', 'remote');
  x.git('branch', 'feature/totp_login');
  x.git('branch', '-D', 'dev');
  await x.storage.fetch(x.repo.id);
  const refs = await x.storage.refs(x.repo.id);
  assert.ok(refs.some((r) => r.name === 'feature/totp_login'));
  assert.ok(!refs.some((r) => r.name === 'dev'));
  assert.ok(refs.some((r) => r.name === 'v1'));
  assert.ok(x.seen.includes(a.id) && x.seen.includes(b.id));
  const config = await fs.readFile(
    path.join(first.storage_path, 'config'),
    'utf8',
  );
  assert.match(config, /https:\/\/fixture.invalid/);
  assert.equal(config.includes('secret-'), false);
  assert.equal(
    await fs.readFile(path.join(first.storage_path, 'sentinel'), 'utf8'),
    'preserve',
  );
  await fs.rename(first.storage_path, first.storage_path + '.missing');
  assert.equal(
    (await x.storage.diagnostics(x.repo.id)).repository.storage_state,
    'MISSING',
  );
});
test('branch worktrees share objects; fetch never moves a worktree; update is explicit FF only', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const main = await create(x),
    dev = await create(x, 'dev');
  await assert.rejects(
    create(x),
    (e) => e.error_code === 'BRANCH_ALREADY_CHECKED_OUT',
  );
  assert.ok((await fs.stat(path.join(main.local_path, '.git'))).isFile());
  assert.equal(
    x.local(main.local_path, 'rev-parse', '--git-common-dir'),
    x.local(dev.local_path, 'rev-parse', '--git-common-dir'),
  );
  await fs.writeFile(path.join(x.origin, 'file.txt'), 'new\n');
  x.git('commit', '-am', 'next');
  await x.storage.fetch(x.repo.id);
  const behind = await x.worktrees.status(main.id);
  assert.equal(behind.git.behind, 1);
  assert.equal(behind.git.head, main.git.head);
  const updated = await x.worktrees.update(main.id);
  assert.equal(updated.git.behind, 0);
  assert.equal(
    await fs.readFile(path.join(main.local_path, 'file.txt'), 'utf8'),
    'new\n',
  );
  await assert.rejects(
    x.storage.remove(x.repo.id),
    (e) => e.error_code === 'REPOSITORY_IN_USE',
  );
  await x.worktrees.remove(dev.id);
  assert.equal(await x.WorktreeModel.count(), 1);
});
test('dirty, staged, ignored/untracked and conflicts are visible and protected', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const wt = await create(x);
  const file = path.join(wt.local_path, 'file.txt');
  await fs.writeFile(file, 'local\n');
  let state = await x.worktrees.status(wt.id);
  assert.equal(state.git.modified, 1);
  await assert.rejects(
    x.worktrees.update(wt.id),
    (e) => e.error_code === 'WORKTREE_DIRTY',
  );
  await assert.rejects(
    x.worktrees.remove(wt.id),
    (e) => e.error_code === 'WORKTREE_DIRTY',
  );
  x.local(wt.local_path, 'add', 'file.txt');
  state = await x.worktrees.status(wt.id);
  assert.equal(state.git.staged, 1);
  await fs.writeFile(path.join(wt.local_path, 'untracked.txt'), 'unique');
  state = await x.worktrees.status(wt.id);
  assert.equal(state.git.untracked, 1);
  x.local(wt.local_path, 'commit', '-m', 'local');
  await fs.rm(path.join(wt.local_path, 'untracked.txt'));
  await fs.writeFile(path.join(x.origin, 'file.txt'), 'remote\n');
  x.git('commit', '-am', 'remote');
  await x.storage.fetch(x.repo.id);
  try {
    x.local(wt.local_path, 'merge', 'origin/main');
  } catch {}
  state = await x.worktrees.status(wt.id);
  assert.equal(state.git.conflicted, 1);
  await assert.rejects(
    x.worktrees.update(wt.id),
    (e) => e.error_code === 'WORKTREE_CONFLICT',
  );
  await assert.rejects(
    x.worktrees.repair(wt.id),
    (e) => e.error_code === 'WORKTREE_CONFLICT',
  );
});
test('local commits are retained; diverged and detached worktrees cannot be reset by update/delete', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const wt = await create(x);
  await fs.writeFile(path.join(wt.local_path, 'local'), 'only here');
  x.local(wt.local_path, 'add', '.');
  x.local(wt.local_path, 'commit', '-m', 'local');
  let state = await x.worktrees.status(wt.id);
  assert.equal(state.git.ahead, 1);
  assert.equal((await x.worktrees.update(wt.id)).git.head, state.git.head);
  await assert.rejects(
    x.worktrees.remove(wt.id),
    (e) => e.error_code === 'WORKTREE_LOCAL_COMMITS',
  );
  await fs.writeFile(path.join(x.origin, 'remote'), 'remote');
  x.git('add', '.');
  x.git('commit', '-m', 'remote');
  await x.storage.fetch(x.repo.id);
  await assert.rejects(
    x.worktrees.update(wt.id),
    (e) => e.error_code === 'WORKTREE_DIVERGED',
  );
  const detached = await create(x, 'v1', 'tag');
  assert.equal(detached.git.detached, true);
  await assert.rejects(
    x.worktrees.update(detached.id),
    (e) => e.error_code === 'DETACHED_HEAD',
  );
  await x.worktrees.remove(detached.id);
  const commit = await create(x, x.git('rev-parse', 'HEAD'), 'commit');
  assert.equal(commit.git.detached, true);
});
test('execution leases block mutation and prune; missing worktrees remain records and repair preserves branch', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const wt = await create(x);
  const lease = await x.worktrees.acquireExecutionLease(wt.id, {
    owner_type: 'test',
    owner_id: 'execution',
  });
  try {
    assert.equal((await x.worktrees.status(wt.id)).lease.busy, true);
    for (const operation of [
      () => x.worktrees.update(wt.id),
      () => x.worktrees.remove(wt.id),
      () => x.storage.prune(x.repo.id),
    ])
      await assert.rejects(
        operation(),
        (e) => e.error_code === 'WORKTREE_BUSY',
      );
  } finally {
    await lease.release();
  }
  await fs.rm(wt.local_path, { recursive: true });
  assert.equal((await x.worktrees.status(wt.id)).lifecycle_state, 'MISSING');
  assert.equal(await x.WorktreeModel.count(), 1);
  await assert.rejects(
    x.worktrees.repair(wt.id),
    (e) => e.error_code === 'WORKTREE_STALE',
  );
  await x.storage.prune(x.repo.id);
  const repaired = await x.worktrees.repair(wt.id);
  assert.equal(repaired.git.head, wt.git.head);
  await x.worktrees.remove(wt.id);
  await x.storage.remove(x.repo.id);
  assert.equal(await x.RepositoryModel.count(), 0);
});
test('non-git storage and managed-path symlink replacements never trigger recursive deletion', async (t) => {
  const x = await setup(t),
    target = await x.storage.paths.repository(x.repo);
  await x.storage.paths.parents(target);
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'unique'), 'data');
  await assert.rejects(
    x.storage.initialize(x.repo.id),
    (e) => e.error_code === 'PATH_CONFLICT',
  );
  assert.equal(await fs.readFile(path.join(target, 'unique'), 'utf8'), 'data');
  await fs.rm(target, { recursive: true });
  await fs.symlink(x.origin, target);
  await assert.rejects(
    x.storage.initialize(x.repo.id),
    (e) => e.error_code === 'PATH_CONFLICT',
  );
  assert.equal(
    await fs.readFile(path.join(x.origin, 'file.txt'), 'utf8'),
    'initial\n',
  );
});
