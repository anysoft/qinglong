const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const setup = require('../phase4/helpers.cjs');
test('snapshot cleanup preserves live owners, removes stale dead owners, rejects symlinks and oversized environment', async t => {
  const h = await setup(t); 
  const task = await h.SchedulerProjectionModel.create({ command: 'task a.sh' });
  await h.variables.save('task', task.id, [{ name: 'TOKEN', value: 'private', is_secret: true }]);
  const transport = new (h.get('services/executionEnvironmentTransport').default)();
  const resolved = await h.resolver.resolve(task.id), snapshot = await transport.prepare(resolved, process.pid);
  const old = new Date(Date.now() - 2 * 3600000); fs.utimesSync(snapshot.directory, old, old);
  await transport.cleanupStale(); assert.ok(fs.existsSync(snapshot.directory));
  fs.writeFileSync(path.join(snapshot.directory, 'owner.json'), JSON.stringify({ pid: 2147483647 })); fs.utimesSync(snapshot.directory, old, old);
  await transport.cleanupStale(); assert.equal(fs.existsSync(snapshot.directory), false);
  const large = { ...resolved, variables: { LARGE: 'x'.repeat(140000) } };
  await assert.rejects(transport.prepare(large, process.pid), /ENVIRONMENT_TOO_LARGE/);
  await assert.rejects(h.variables.save('task', task.id, [{ name: 'which_program', value: 'secret-command', is_secret: true }]), /ENV_NAME_INVALID/);
  fs.rmSync(path.join(h.dir, '.tmp/task-env'), { recursive: true }); fs.symlinkSync(path.join(h.dir, 'data/scripts'), path.join(h.dir, '.tmp/task-env'));
  await assert.rejects(transport.prepare(resolved, process.pid), /ENV_SNAPSHOT_FAILED/);
  assert.equal(fs.readdirSync(path.join(h.dir, 'data/scripts')).length, 0);
});
test('global-only execution allocates a private full snapshot', async t => {
 const h=await setup(t), transport=new(h.get('services/executionEnvironmentTransport').default)();
 const snapshot=await transport.prepare(await h.resolver.resolve(null),process.pid);
 assert.ok(snapshot.directory);assert.deepEqual(fs.readdirSync(snapshot.directory).sort(),['environment.sh','owner.json','snapshot.json']);await snapshot.cleanup();
});
