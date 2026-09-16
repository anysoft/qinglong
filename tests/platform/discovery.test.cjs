const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const setup = require('../phase3/helpers.cjs');
test('DB projection controls identity, nested filters, metadata updates, user edits and removal policy', async t => {
  const h = await setup(t), Adapter = h.get('services/subscriptionDiscovery').default;
  const stage = path.join(h.dir, 'stage'); await fs.mkdir(stage);
  await fs.mkdir(path.join(h.origin, 'nested'));
  await fs.writeFile(path.join(h.origin, 'nested/job.ts'), '// name: Job\n// cron: 1 2 * * *\n');
  await fs.writeFile(path.join(h.origin, 'skip.ts'), '// cron: 1 2 * * *\n');
  await fs.writeFile(path.join(h.origin, 'nested/unscheduled.ts'), '// new Env("ignored")\n');
  await fs.writeFile(path.join(h.origin, 'support.py'), 'print("support")');
  const sub = { id: 42, extensions: 'ts', whitelist: 'nested|skip', blacklist: 'skip', dependences: 'support', autoAddCron: 1, autoDelCron: 1 };
  const adapter = new Adapter();
  const first = await adapter.discover(h.origin, stage, sub, []);
  assert.equal(first.adds.length, 1); assert.equal(first.adds[0].name, 'Job');
  assert.equal(first.adds[0].command, 'task subscription-42/nested/job.ts');
  assert.equal(first.diagnostics[0].code, 'NO_CRON_METADATA');
  await fs.access(path.join(stage, 'support.py')); await assert.rejects(fs.access(path.join(stage, 'skip.ts')));
  const old = { ...first.adds[0], id: 7, name: 'User name', isDisabled: 1, env_profile_id: 9 };
  await fs.writeFile(path.join(h.origin, 'nested/job.ts'), '// name: Source renamed\n// cron: 2 3 * * *\n');
  const next = await adapter.discover(h.origin, stage, sub, [old]);
  assert.equal(next.adds.length, 0); assert.equal(next.updates[0].id, 7); assert.equal(next.updates[0].name, undefined);
  assert.equal(next.updates[0].schedule, '2 3 * * *'); assert.equal(next.updates[0].env_profile_id, undefined);
  await fs.rm(path.join(h.origin, 'nested/job.ts'));
  assert.deepEqual((await adapter.discover(h.origin, stage, { ...sub, autoDelCron: 0 }, [old])).drops, []);
  assert.deepEqual((await adapter.discover(h.origin, stage, sub, [old])).drops, [7]);
  const other = await adapter.discover(h.origin, stage, { ...sub, id: 43 }, [old]); assert.deepEqual(other.drops, []);
  await assert.rejects(adapter.discover(h.origin, stage, { ...sub, whitelist: '[' }, []), /INVALID_DISCOVERY_FILTER/);
});
test('symlinks fail closed and no cron metadata never invents a schedule', async t => {
  const h = await setup(t), Adapter = h.get('services/subscriptionDiscovery').default;
  const stage = path.join(h.dir, 'stage'); await fs.mkdir(stage);
  await fs.writeFile(path.join(h.origin, 'plain.py'), '# name: No schedule\n');
  const plan = await new Adapter().discover(h.origin, stage, { id: 1 }, []);
  assert.equal(plan.adds.length, 0); assert.equal(plan.diagnostics[0].code, 'NO_CRON_METADATA');
  await fs.symlink('/etc/passwd', path.join(h.origin, 'external.py'));
  await assert.rejects(new Adapter().discover(h.origin, stage, { id: 1 }, []), /UNSAFE_DISCOVERY_PATH/);
});
test('definition DB failure and scheduler failure compensate updates without changing task identity or overrides', async t => {
  const h = await setup(t), Cron = h.get('services/cron').default;
  const cron = new Cron({ error() {}, warn() {} });
  const old = await h.SchedulerProjectionModel.create({ name: 'Old', command: 'task subscription-1/job.js', schedule: '0 8 * * *', sub_id: 1, discovery_key: 'source-key', source_relative_path: 'job.js', discovery_definition: { name: 'Old', command: 'task subscription-1/job.js', schedule: '0 8 * * *' }, isDisabled: 1 });
  for (const failure of ['db', 'scheduler']) {
    let live = 'old', cleaned = false, once = true;
    const update = h.SchedulerProjectionModel.update, set = cron.setCrontab;
    if (failure === 'db') h.SchedulerProjectionModel.update = async (...args) => { if (once) { once = false; throw new Error('fixture DB failure'); } return update.apply(h.SchedulerProjectionModel, args); };
    else cron.setCrontab = async (...args) => { if (once) { once = false; throw new Error('fixture scheduler failure'); } return set.apply(cron, args); };
    const discover = async () => ({ subscriptionId: 1, adds: [], drops: [], updates: [{ id: old.id, schedule: '0 9 * * *', discovery_definition: { ...old.discovery_definition, schedule: '0 9 * * *' } }], publish: async () => { live = 'new'; }, rollback: async () => { live = 'old'; }, cleanup: async () => { cleaned = true; } });
    await assert.rejects(new(h.get('services/task').default)().reconcileDiscoveredTasks(cron, discover, async () => {}));
    h.SchedulerProjectionModel.update = update; cron.setCrontab = set;
    assert.equal(live, 'old'); assert.equal(cleaned, true); await old.reload();
    assert.equal(old.schedule, '0 8 * * *'); assert.equal(old.isDisabled, 1);
    await new(h.get('services/task').default)().reconcileDiscoveredTasks(cron, discover, async () => {}); assert.equal(live, 'new');
    await old.reload();
    await old.update({ schedule: '0 8 * * *', discovery_definition: { ...old.discovery_definition, schedule: '0 8 * * *' } });
  }
});
