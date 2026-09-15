const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const setup = require('../phase4/helpers.cjs');
function run(h, language, snapshot, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [path.join(h.dir, 'shell/task.sh'), `check.${language}`, 'now'], { env: { ...process.env, QL_DIR: h.dir, QL_DATA_DIR: path.join(h.dir, 'data'), ID: '', real_time: 'true', no_delay: 'true', QL_TASK_ENV_SNAPSHOT: snapshot.directory, ...extra } });
    let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x); child.on('error', reject); child.on('close', code => resolve({ code, output }));
  });
}
test('actual Python/Node/Shell snapshot complex values, UNSET, no interpolation or secret logs', async t => {
  const h = await setup(t), task = await h.CrontabModel.create({ command: 'task check.py' });
  await h.EnvModel.bulkCreate([{ name: 'TOKEN', value: 'global', status: 0 }, { name: 'REMOVE', value: 'global', status: 0 }]); 
  const values = { TOKEN: 'private-four-secret', EMPTY: '', SPACE: ' around ', UNICODE: '中文😀', SPECIAL: `a=b&$'"`, JSON: '{"a":"b=c"}', MULTILINE: 'line1\nline2\n', URL: 'https://a.invalid/?a=b&c=d', INJECTION: '$(touch ' + path.join(h.dir, 'pwned') + ')`false`', LONG: 'x'.repeat(16000) };
  await h.variables.save('task', task.id, [...Object.entries(values).map(([name, value]) => ({ name, value, is_secret: name === 'TOKEN' })), { name: 'REMOVE', operation: 'UNSET' }, { name: 'HOST_REMOVE', operation: 'UNSET' }]);
  const expected = JSON.stringify(values), outPath = path.join(h.dir, 'result');
  const names = [...Object.keys(values), 'REMOVE', 'HOST_REMOVE', 'JWT_SECRET', 'BACKEND_TOKEN'];
  fs.writeFileSync(path.join(h.dir, 'data/scripts/check.js'), `require('fs').writeFileSync(process.env.OUT,JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.filter(k=>k in process.env).map(k=>[k,process.env[k]])))); console.log(process.env.TOKEN);`);
  fs.writeFileSync(path.join(h.dir, 'data/scripts/check.py'), `import os,json\nwith open(os.environ['OUT'],'w') as f: json.dump({k:os.environ[k] for k in ${JSON.stringify(names)} if k in os.environ},f)\nprint(os.environ['TOKEN'])\n`);
  fs.writeFileSync(path.join(h.dir, 'data/scripts/check.sh'), 'node -e \'require("fs").writeFileSync(process.env.OUT,JSON.stringify(Object.fromEntries(' + JSON.stringify(names) + '.filter(k=>k in process.env).map(k=>[k,process.env[k]]))))\'\nprintf "%s\\n" "$TOKEN"\n');
  await h.variables.save('task', task.id, [{ name: 'OUT', value: outPath }]);
  fs.copyFileSync(path.join(h.dir, 'data/scripts/check.js'), path.join(h.dir, 'data/scripts/check.ts'));
  const transport = new (h.get('services/executionEnvironmentTransport').default)();
  for (const language of ['js', 'py', 'sh', 'ts']) {
    const resolved = await h.resolver.resolve(task.id), snapshot = await transport.prepare(resolved, process.pid);
    assert.equal(fs.statSync(snapshot.directory).mode & 0o777, 0o700);
    for (const file of fs.readdirSync(snapshot.directory)) assert.equal(fs.statSync(path.join(snapshot.directory, file)).mode & 0o777, 0o600);
    const result = await run(h, language, snapshot, { OUT: outPath, HOST_REMOVE: 'host', JWT_SECRET: 'backend-secret', BACKEND_TOKEN: 'backend-token' });
    assert.equal(result.code, 0, result.output); assert.deepEqual(JSON.parse(fs.readFileSync(outPath)), JSON.parse(expected), result.output);
    assert.doesNotMatch(result.output, /private-four-secret/); assert.match(result.output, /\*{8}/);
    assert.equal(fs.existsSync(path.join(h.dir, 'pwned')), false);
    await snapshot.cleanup(); assert.equal(fs.existsSync(snapshot.directory), false);
  }
  assert.equal(process.env.TOKEN, undefined);
});
test('50 simultaneously live runs across repositories/profiles/tasks isolate snapshots and preserve A across update to B', { timeout: 180000 }, async t => {
  const h = await setup(t), transport = new (h.get('services/executionEnvironmentTransport').default)();
  const barrier = path.join(h.dir, 'barrier'); fs.mkdirSync(barrier);
  fs.writeFileSync(path.join(h.dir, 'data/scripts/check.sh'), 'touch "$BARRIER/$INSTANCE"\nwhile [[ ! -f "$BARRIER/release" ]]; do sleep 0.1; done\nprintf "VALUE:%s:%s\\n" "$PROFILE_VALUE" "$TASK_VALUE"\n');
  const snapshots = [], tasks = [];
  for (let i = 0; i < 50; i++) {
    const repo = await h.RepositoryModel.create({ name: `repo-${i}`, provider: 'generic', remote_url: `https://example.invalid/${i}`, normalized_url: `example.invalid/${i}` });
    const sub = await h.SubscriptionModel.create({ name: `sub-${i}`, repository_id: repo.id });
    const profile = await h.profiles.save({ repository_id: repo.id, name: 'profile' });
    await h.variables.save('repository', profile.id, [{ name: 'PROFILE_VALUE', value: `repo-${i}` }]);
    const task = await h.CrontabModel.create({ command: 'task check.sh', sub_id: sub.id }); tasks.push(task);
    await h.variables.bind('task', task.id, profile.id);
    await h.variables.save('task', task.id, [{ name: 'TASK_VALUE', value: `A-${i}` }, { name: 'BARRIER', value: barrier }, { name: 'INSTANCE', value: String(i) }]);
    snapshots.push(await transport.prepare(await h.resolver.resolve(task.id), process.pid));
  }
  const runs = snapshots.map(snapshot => run(h, 'sh', snapshot));
  try {
    const deadline = Date.now() + 90000;
    while (fs.readdirSync(barrier).length < 50 && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    assert.equal(fs.readdirSync(barrier).length, 50, 'all 50 child scripts must be simultaneously waiting');
    for (let i = 0; i < 50; i++) await h.variables.save('task', tasks[i].id, [{ name: 'TASK_VALUE', value: `B-${i}` }]);
    fs.writeFileSync(path.join(barrier, 'release'), '');
    const results = await Promise.all(runs);
    results.forEach((result, i) => { assert.equal(result.code, 0, result.output); assert.match(result.output, new RegExp(`VALUE:repo-${i}:A-${i}\\n`)); });
    const next = await transport.prepare(await h.resolver.resolve(tasks[0].id), process.pid);
    try { assert.match((await run(h, 'sh', next)).output, /VALUE:repo-0:B-0/); } finally { await next.cleanup(); }
  } finally { fs.writeFileSync(path.join(barrier, 'release'), ''); await Promise.all(runs); await Promise.all(snapshots.map(x => x.cleanup())); }
  assert.equal(process.env.TASK_VALUE, undefined); assert.equal(process.env.PROFILE_VALUE, undefined);
});
