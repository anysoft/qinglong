const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const setup = require('./helpers.cjs');
test('real ID-to-SQLite shell bridge resolves current config, cleans per-run files and fails disabled profiles', async t => {
  const h = await setup({ after: fn => t.after(fn), fileDatabase: true });
  const repo = await h.RepositoryModel.create({ name: 'bridge', provider: 'generic', remote_url: 'https://bridge.invalid/a', normalized_url: 'bridge.invalid/a' });
  const sub = await h.SubscriptionModel.create({ alias: 'bridge', repository_id: repo.id });
  const task = await h.CrontabModel.create({ command: 'task bridge.sh', sub_id: sub.id });
  const p = await h.profiles.save({ repository_id: repo.id, name: 'prod', is_default: true });
  await h.variables.save('repository', p.id, [{ name: 'BRIDGE_TOKEN', value: 'bridge-private', is_secret: true }]); await h.globals.set_envs();
  fs.mkdirSync(path.join(h.dir, 'data/db'), { recursive: true });
  fs.symlinkSync(path.join(h.dir, 'database.sqlite'), path.join(h.dir, 'data/db/database.sqlite'));
  fs.mkdirSync(path.join(h.dir, 'static'), { recursive: true });
  fs.symlinkSync(path.join(h.root, 'static/build'), path.join(h.dir, 'static/build'));
  fs.writeFileSync(path.join(h.dir, '.env'), '');
  fs.writeFileSync(path.join(h.dir, 'data/scripts/bridge.sh'), '[[ "$BRIDGE_TOKEN" == "bridge-private" ]] || exit 7\nprintf "BRIDGE_PASS\\n%s\\n" "$BRIDGE_TOKEN"');
  const run = () => new Promise((resolve, reject) => {
    const cp = spawn('/bin/bash', [path.join(h.dir, 'shell/task.sh'), 'bridge.sh', 'now'], { env: { ...process.env, QL_DIR: h.dir, QL_DATA_DIR: path.join(h.dir, 'data'), ID: String(task.id), real_time: 'true' } });
    let output = ''; cp.stdout.on('data', x => output += x); cp.stderr.on('data', x => output += x); cp.on('error', reject); cp.on('close', code => resolve({ code, output }));
  });
  const good = await run(); assert.equal(good.code, 0, good.output); assert.match(good.output, /BRIDGE_PASS/); assert.doesNotMatch(good.output, /bridge-private/);
  assert.deepEqual(fs.readdirSync(path.join(h.dir, '.tmp/task-env')), []);
  await h.profiles.save({ id: p.id, status: 'disabled' });
  const bad = await run(); assert.equal(bad.code, 1, bad.output); assert.match(bad.output, /ENV_PROFILE_DISABLED/); assert.doesNotMatch(bad.output, /BRIDGE_PASS|bridge-private/);
});
