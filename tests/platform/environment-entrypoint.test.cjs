const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const setup = require('../phase4/helpers.cjs');
test('real ID-to-SQLite shell bridge resolves current config, cleans per-run files and fails disabled profiles', async t => {
  const h = await setup({ after: fn => t.after(fn), fileDatabase: true });
  const repo = await h.RepositoryModel.create({ name: 'bridge', provider: 'generic', remote_url: 'https://bridge.invalid/a', normalized_url: 'bridge.invalid/a' });
  const sub = await h.SubscriptionModel.create({ name: 'bridge', repository_id: repo.id });
  const task = await h.SchedulerProjectionModel.create({ command: 'task subscription-1/bridge.sh', sub_id: sub.id });
  const p = await h.profiles.save({ repository_id: repo.id, name: 'prod', is_default: true });
  await h.variables.save('repository', p.id, [{ name: 'BRIDGE_TOKEN', value: 'bridge-private', is_secret: true }]); 
  fs.mkdirSync(path.join(h.dir, 'data/db'), { recursive: true });
  fs.symlinkSync(path.join(h.dir, 'database.sqlite'), path.join(h.dir, 'data/db/database.sqlite'));
  fs.mkdirSync(path.join(h.dir, 'static'), { recursive: true });
  fs.symlinkSync(path.join(h.root, 'static/build'), path.join(h.dir, 'static/build'));
  fs.writeFileSync(path.join(h.dir, '.env'), '');
  fs.mkdirSync(path.join(h.dir, 'data/scripts/subscription-1'));
  fs.writeFileSync(path.join(h.dir, 'data/scripts/subscription-1/bridge.sh'), '[[ "$BRIDGE_TOKEN" == "bridge-private" ]] || exit 7\nprintf "BRIDGE_PASS\\n%s\\n" "$BRIDGE_TOKEN"');
  const run = (id = String(task.id), file = 'subscription-1/bridge.sh') => new Promise((resolve, reject) => {
    const cp = spawn('/bin/bash', [path.join(h.dir, 'shell/task.sh'), file, 'now'], { env: { ...process.env, QL_DIR: h.dir, QL_DATA_DIR: path.join(h.dir, 'data'), ID: id, real_time: 'true' } });
    let output = ''; cp.stdout.on('data', x => output += x); cp.stderr.on('data', x => output += x); cp.on('error', reject); cp.on('close', code => resolve({ code, output }));
  });
  await h.variables.save('global', 0, [{ name: 'GLOBAL_ONLY', value: 'literal global' }]);
  fs.writeFileSync(path.join(h.dir, 'data/scripts/global.sh'), '[[ "$GLOBAL_ONLY" == "literal global" ]] || exit 8\nprintf "GLOBAL_PASS\\n"');
  const noId = await run('', 'global.sh'); assert.equal(noId.code, 0, noId.output); assert.match(noId.output, /GLOBAL_PASS/);
  const good = await run(); assert.equal(good.code, 0, good.output); assert.match(good.output, /BRIDGE_PASS/); assert.doesNotMatch(good.output, /bridge-private/);
  assert.deepEqual(fs.readdirSync(path.join(h.dir, '.tmp/task-env')), []);
  await h.profiles.save({ id: p.id, status: 'disabled' });
  const bad = await run(); assert.equal(bad.code, 1, bad.output); assert.match(bad.output, /ENV_PROFILE_DISABLED/); assert.doesNotMatch(bad.output, /BRIDGE_PASS|bridge-private/);
});
