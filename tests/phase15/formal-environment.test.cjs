const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fixture, task, wait } = require('../phase10/helpers.cjs');

test('formal Shell Task preserves complex ENV and UNSET without interpolation or secret disclosure', async t => {
  const h = await fixture(t);
  const values = { EMPTY: '', SPACE: ' around ', UNICODE: '中文😀', SPECIAL: `a=b&$'"`, MULTILINE: 'a\nb\n', JSON: '{"a":"b=c"}', URL: 'https://a.invalid/?a=b&c=d', LONG: 'x'.repeat(16000), INJECTION: '$(touch pwned)`touch pwned`', TOKEN: 'formal-env-private-secret' };
  const code = Object.keys(values).map(name => `printf '%s' "$${name}" > '${name}.value'`).join('\n') + '\nprintf "%s:%s:%s\\n" "${REMOVE-unset}" "${JWT_SECRET-unset}" "$TOKEN"';
  const f = await task(h, code);
  await h.EnvModel.create({ name: 'REMOVE', value: 'global', status: 0 });
  await h.TaskEnvVariableModel.bulkCreate([
    ...Object.entries(values).map(([name, value]) => ({ task_id: f.definition.id, name, value, is_secret: name === 'TOKEN' })),
    { task_id: f.definition.id, name: 'REMOVE', operation: 'UNSET' },
  ]);
  const run = await h.execution.submit(f.definition.id);
  assert.equal((await wait(h, run.id)).status, 'SUCCESS');
  for (const [name, value] of Object.entries(values)) assert.equal(await fs.readFile(path.join(f.root, name + '.value'), 'utf8'), value);
  const log = await h.execution.log(run.id);
  assert.match(log, /unset:unset:\*{8}/);
  assert.ok(!log.includes(values.TOKEN));
  await assert.rejects(fs.stat(path.join(f.root, 'pwned')), { code: 'ENOENT' });
});

test('50 live formal Resolver/Runner processes retain A across scoped ENV update to B', { timeout: 180000 }, async t => {
  const h = await fixture(t), barrier = path.join(h.root, 'barrier');
  await fs.mkdir(barrier);
  const HookExecutor = h.load('back/services/hookExecutor.ts').default;
  const Runner = h.load('back/services/runnerV2.ts').default;
  const resolved = [], running = [], definitions = [], executors = [];
  try {
    for (let i = 0; i < 50; i++) {
      const f = await task(h, 'touch "$BARRIER/$INSTANCE"\nwhile [ ! -f "$BARRIER/release" ]; do sleep .1; done\nprintf "VALUE:%s:%s\\n" "$PROFILE_VALUE" "$TASK_VALUE"');
      const profile = await h.EnvironmentProfileModel.create({ repository_id: f.repository.id, name: 'profile' });
      await h.RepositoryEnvVariableModel.create({ profile_id: profile.id, name: 'PROFILE_VALUE', value: 'repo-' + i });
      await h.TaskModel.update({ env_profile_id: profile.id }, { where: { id: f.definition.id } });
      await h.TaskEnvVariableModel.bulkCreate(Object.entries({ TASK_VALUE: 'A-' + i, BARRIER: barrier, INSTANCE: String(i) }).map(([name, value]) => ({ task_id: f.definition.id, name, value })));
      const run = await h.execution.submit(f.definition.id);
      const resolution = await h.execution.resolver.resolve(f.definition.id, run.id);
      resolved.push(resolution); definitions.push(f.definition.id);
      assert.ok(Object.isFrozen(resolution.context.environmentSnapshot.variables));
      const executor = new HookExecutor(resolution.leases.map(lease => lease.handle.fd));
      executors.push(executor);
      let output = '';
      running.push(new Runner(executor).run(resolution.context, resolution.context.environmentSnapshot.variables, async text => { output += text; }).then(result => ({ ...result, output })));
    }
    const deadline = Date.now() + 60000;
    while ((await fs.readdir(barrier)).length < 50 && Date.now() < deadline) await new Promise(r => setTimeout(r, 50));
    assert.equal((await fs.readdir(barrier)).length, 50, 'all 50 children must be live before editing ENV');
    for (let i = 0; i < 50; i++) await h.TaskEnvVariableModel.update({ value: 'B-' + i }, { where: { task_id: definitions[i], name: 'TASK_VALUE' } });
    await fs.writeFile(path.join(barrier, 'release'), '');
    const results = await Promise.all(running);
    results.forEach((result, i) => { assert.equal(result.code, 0, result.output); assert.equal(result.output, `VALUE:repo-${i}:A-${i}\n`); });
    for (const resolution of resolved.splice(0).reverse()) await resolution.release();
    const next = await h.execution.resolver.resolve(definitions[0], 999999);
    try { assert.equal(next.context.environmentSnapshot.variables.TASK_VALUE, 'B-0'); } finally { await next.release(); }
  } finally {
    await fs.writeFile(path.join(barrier, 'release'), '');
    executors.forEach(executor => executor.cancel());
    await Promise.allSettled(running);
    for (const resolution of resolved.reverse()) await resolution.release();
  }
});
