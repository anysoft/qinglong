const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const setup = require('./helpers.cjs');
test('snapshot cleanup preserves live owners, removes stale dead owners, rejects symlinks and oversized environment', async t => {
  const h = await setup(t); await h.globals.set_envs();
  const task = await h.CrontabModel.create({ command: 'task a.sh' });
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
test('unconfigured task never allocates a snapshot or changes global generated files', async t => {
  const h = await setup(t), task = await h.CrontabModel.create({ command: 'task a.sh' }); await h.globals.set_envs();
  const files = [h.config.envFile, h.config.jsEnvFile, h.config.pyEnvFile], before = files.map(f => fs.readFileSync(f));
  const transport = new (h.get('services/executionEnvironmentTransport').default)();
  assert.equal(await transport.prepare(await h.resolver.resolve(task.id), process.pid), null);
  assert.equal(fs.existsSync(path.join(h.dir, '.tmp/task-env')), false);
  await h.variables.save('task', task.id, [{ name: 'FOO', value: 'one' }]);
  const snapshot = await transport.prepare(await h.resolver.resolve(task.id), process.pid);
  assert.deepEqual(files.map(f => fs.readFileSync(f)), before); await snapshot.cleanup();
});
