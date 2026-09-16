const test = require('node:test'),
  assert = require('node:assert/strict'),
  path = require('node:path');
const { fixture, task } = require('../phase10/helpers.cjs');
test('Workspace file create/save/rename flows through official Discovery with stable IDs and retirement', async (t) => {
  const h = await fixture(t),
    { repository, worktree, root } = await task(h),
    sub = await h.SubscriptionModel.create({
      repository_id: repository.id,
      worktree_id: worktree.id,
      name: 'Workspace discovery',
    });
  const discovery = new (h.load('back/services/discovery.ts').default)(),
    Files = h.load('back/services/workspaceFiles.ts').WorkspaceFiles,
    f = new Files(root);
  const { platformBarrier } = h.load('back/services/backup/platform.ts');
  async function write(action) {
    return (await platformBarrier()).mutation(async () => {
      const lease = await h.paths.worktree(worktree.id);
      try {
        return await action();
      } finally {
        await lease.release();
      }
    });
  }
  for (const [name, body] of [
    ['new.py', 'print(1)\n'],
    ['new.js', 'console.log(1)\n'],
    ['new.ts', 'console.log(1)\n'],
    ['new.sh', 'echo 1\n'],
  ])
    await write(() => f.create(name, body));
  const before = await h.TaskModel.count();
  assert.equal(before, 1);
  await discovery.reconcile(sub.id);
  const rows = await h.TaskModel.findAll({
    where: { subscription_id: sub.id },
  });
  assert.equal(rows.length, 5);
  const shellSource = await h.TaskSourceModel.findOne({
      where: { worktree_id: worktree.id, relative_entrypoint: 'new.sh' },
    }),
    originalId = shellSource.task_id;
  const old = await f.read('new.sh');
  await write(() => f.save('new.sh', 'echo saved\n', old.hash));
  assert.equal(await h.TaskModel.count(), before + 5);
  await discovery.reconcile(sub.id);
  assert.equal(
    (
      await h.TaskSourceModel.findOne({
        where: { worktree_id: worktree.id, relative_entrypoint: 'new.sh' },
      })
    ).task_id,
    originalId,
  );
  await write(() =>
    f.rename(
      'new.sh',
      'renamed.sh',
      require('node:crypto')
        .createHash('sha256')
        .update('echo saved\n')
        .digest('hex'),
    ),
  );
  await discovery.reconcile(sub.id);
  assert.equal((await h.TaskModel.findByPk(originalId)).enabled, false);
  const renamed = await h.TaskSourceModel.findOne({
    where: { worktree_id: worktree.id, relative_entrypoint: 'renamed.sh' },
  });
  assert.notEqual(renamed.task_id, originalId);
  assert.equal(await h.TaskRunModel.count(), 0);
  assert.equal(await h.TriggerEventModel.count(), 0);
});
