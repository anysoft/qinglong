const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const setup = require('./helpers.cjs');
const create = (x) =>
  x.worktrees.create({
    repository_id: x.repo.id,
    name: 'main',
    ref_type: 'branch',
    ref_name: 'main',
  });
test('worktree deletion DB failure is recoverable by reconstruction without resetting local history', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const wt = await create(x),
    destroy = x.WorktreeModel.prototype.destroy;
  x.WorktreeModel.prototype.destroy = async () => {
    throw new Error('injected DB failure');
  };
  try {
    await assert.rejects(x.worktrees.remove(wt.id), /injected/);
  } finally {
    x.WorktreeModel.prototype.destroy = destroy;
  }
  assert.equal(await x.WorktreeModel.count(), 1);
  assert.equal((await x.worktrees.status(wt.id)).lifecycle_state, 'MISSING');
  const repaired = await x.worktrees.repair(wt.id);
  assert.equal(repaired.git.head, wt.git.head);
  await x.worktrees.remove(wt.id);
});
test('repository delete can retry after filesystem success and DB failure', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const destroy = x.RepositoryModel.destroy;
  x.RepositoryModel.destroy = async () => {
    throw new Error('injected');
  };
  try {
    await assert.rejects(x.storage.remove(x.repo.id), /injected/);
  } finally {
    x.RepositoryModel.destroy = destroy;
  }
  assert.equal(
    (await x.storage.diagnostics(x.repo.id)).repository.storage_state,
    'MISSING',
  );
  await x.storage.remove(x.repo.id);
  assert.equal(await x.RepositoryModel.count(), 0);
});
test('operation timeout persists ERROR and releases mutation lease', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const wt = await create(x),
    run = x.commands.run.bind(x.commands);
  const { WorkspaceError } = x.get('shared/workspaceError');
  x.commands.run = async (...args) => {
    if (args[2][0] === 'merge') throw new WorkspaceError('GIT_TIMEOUT');
    return run(...args);
  };
  await assert.rejects(
    x.worktrees.update(wt.id),
    (e) => e.error_code === 'GIT_TIMEOUT',
  );
  assert.equal(
    (await x.WorktreeModel.findByPk(wt.id)).lifecycle_state,
    'ERROR',
  );
  assert.equal((await x.storage.locks.probe('worktree', wt.id)).busy, false);
});
test('ignored files and symlink replacement protect user data; orphan worktrees are diagnosed', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const wt = await create(x);
  await fs.writeFile(path.join(wt.local_path, '.gitignore'), 'private.env\n');
  x.local(wt.local_path, 'add', '.gitignore');
  x.local(wt.local_path, 'commit', '-m', 'ignore');
  await fs.writeFile(path.join(wt.local_path, 'private.env'), 'unique data');
  const status = await x.worktrees.status(wt.id);
  assert.equal(status.git.ignored, 1);
  await assert.rejects(
    x.worktrees.remove(wt.id),
    (e) => e.error_code === 'WORKTREE_DIRTY',
  );
  const saved = wt.local_path + '.saved';
  await fs.rename(wt.local_path, saved);
  await fs.symlink(x.origin, wt.local_path);
  await assert.rejects(
    x.worktrees.remove(wt.id),
    (e) => e.error_code === 'PATH_CONFLICT',
  );
  assert.equal(
    await fs.readFile(path.join(saved, 'private.env'), 'utf8'),
    'unique data',
  );
  await fs.unlink(wt.local_path);
  await fs.rename(saved, wt.local_path);
  const bare = (await x.storage.get(x.repo.id)).storage_path,
    orphan = path.join(x.dir, 'orphan');
  x.local(bare, 'worktree', 'add', '--detach', orphan, 'origin/dev');
  const diagnostics = await x.storage.diagnostics(x.repo.id);
  assert.equal(diagnostics.orphans[0].path, await fs.realpath(orphan));
});
test('remote spelling changes preserve identity and storage while protecting legacy subscriptions', async (t) => {
  const x = await setup(t);
  const initialized = await x.storage.initialize(x.repo.id);
  const updated = await x.storage.changeRemote(
    x.repo.id,
    'https://fixture.invalid/team/project',
  );
  assert.equal(updated.normalized_url, x.repo.normalized_url);
  await x.storage.fetch(x.repo.id);
  assert.equal(
    (await x.storage.get(x.repo.id)).storage_path,
    initialized.storage_path,
  );
  await assert.rejects(
    x.storage.changeRemote(x.repo.id, 'https://fixture.invalid/other/project'),
    (e) => e.error_code === 'REMOTE_IDENTITY_CHANGED',
  );
  await x.SubscriptionModel.create({
    name: 'legacy',
    alias: 'legacy',
    repository_id: x.repo.id,
    url: x.repo.remote_url,
  });
  await assert.rejects(
    x.storage.changeRemote(x.repo.id, x.repo.remote_url),
    (e) => e.error_code === 'REPOSITORY_IN_USE',
  );
});

test('Git core.worktree override cannot redirect status or mutations outside managed checkout', async (t) => {
  const x = await setup(t);
  await x.storage.initialize(x.repo.id);
  const wt = await create(x);
  const bare = (await x.storage.get(x.repo.id)).storage_path;
  x.local(bare, 'config', 'extensions.worktreeConfig', 'true');
  x.local(wt.local_path, 'config', '--worktree', 'core.bare', 'false');
  x.local(wt.local_path, 'config', '--worktree', 'core.worktree', x.origin);
  const status = await x.worktrees.status(wt.id);
  assert.equal(status.error_code, 'PATH_CONFLICT');
  await assert.rejects(
    x.worktrees.update(wt.id),
    (e) => e.error_code === 'PATH_CONFLICT',
  );
  await assert.rejects(
    x.worktrees.remove(wt.id),
    (e) => e.error_code === 'PATH_CONFLICT',
  );
  assert.equal(
    await fs.readFile(path.join(x.origin, 'file.txt'), 'utf8'),
    'initial\n',
  );
});
