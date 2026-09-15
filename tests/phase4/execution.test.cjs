const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const setup = require('./helpers.cjs');
function run(h, language, snapshot, extra = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', [path.join(h.dir, 'shell/task.sh'), `check.${language}`, 'now'], { env: { ...process.env, QL_DIR: h.dir, QL_DATA_DIR: path.join(h.dir, 'data'), ID: '', real_time: 'true', no_delay: 'true', QL_TASK_ENV_SNAPSHOT: snapshot.directory, ...extra } });
    let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x); child.on('error', reject); child.on('close', code => resolve({ code, output }));
  });
}
test('actual Python/Node/Shell snapshot complex values, UNSET, no interpolation or secret logs', async t => {
  const h = await setup(t), task = await h.CrontabModel.create({ command: 'task check.py' });
  await h.EnvModel.bulkCreate([{ name: 'TOKEN', value: 'global', status: 0 }, { name: 'REMOVE', value: 'global', status: 0 }]); await h.globals.set_envs();
  const values = { TOKEN: 'private-four-secret', EMPTY: '', SPACE: ' around ', UNICODE: '中文😀', SPECIAL: `a=b&$'"`, JSON: '{"a":"b=c"}', MULTILINE: 'line1\nline2\n', URL: 'https://a.invalid/?a=b&c=d', INJECTION: '$(touch ' + path.join(h.dir, 'pwned') + ')`false`', LONG: 'x'.repeat(16000) };
  await h.variables.save('task', task.id, [...Object.entries(values).map(([name, value]) => ({ name, value, is_secret: name === 'TOKEN' })), { name: 'REMOVE', operation: 'UNSET' }, { name: 'HOST_REMOVE', operation: 'UNSET' }]);
  const expected = JSON.stringify(values), outPath = path.join(h.dir, 'result');
  const names = [...Object.keys(values), 'REMOVE', 'HOST_REMOVE'];
  fs.writeFileSync(path.join(h.dir, 'data/scripts/check.js'), `require('fs').writeFileSync(process.env.OUT,JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.filter(k=>k in process.env).map(k=>[k,process.env[k]])))); console.log(process.env.TOKEN);`);
  fs.writeFileSync(path.join(h.dir, 'data/scripts/check.py'), `import os,json\nwith open(os.environ['OUT'],'w') as f: json.dump({k:os.environ[k] for k in ${JSON.stringify(names)} if k in os.environ},f)\nprint(os.environ['TOKEN'])\n`);
  fs.writeFileSync(path.join(h.dir, 'data/scripts/check.sh'), 'node -e \'require("fs").writeFileSync(process.env.OUT,JSON.stringify(Object.fromEntries(' + JSON.stringify(names) + '.filter(k=>k in process.env).map(k=>[k,process.env[k]]))))\'\nprintf "%s\\n" "$TOKEN"\n');
  const transport = new (h.get('services/executionEnvironmentTransport').default)();
  for (const language of ['js', 'py', 'sh']) {
    const resolved = await h.resolver.resolve(task.id), snapshot = await transport.prepare(resolved, process.pid);
    assert.equal(fs.statSync(snapshot.directory).mode & 0o777, 0o700);
    for (const file of fs.readdirSync(snapshot.directory)) assert.equal(fs.statSync(path.join(snapshot.directory, file)).mode & 0o777, 0o600);
    const result = await run(h, language, snapshot, { OUT: outPath, HOST_REMOVE: 'host' });
    assert.equal(result.code, 0, result.output); assert.deepEqual(JSON.parse(fs.readFileSync(outPath)), JSON.parse(expected), result.output);
    assert.doesNotMatch(result.output, /private-four-secret/); assert.match(result.output, /\*{8}/);
    assert.equal(fs.existsSync(path.join(h.dir, 'pwned')), false);
    await snapshot.cleanup(); assert.equal(fs.existsSync(snapshot.directory), false);
  }
  assert.equal(process.env.TOKEN, undefined);
});
test('50 parallel isolated executions and frozen values after configuration update', { timeout: 120000 }, async t => {
  const h = await setup(t); await h.globals.set_envs();
  const transport = new (h.get('services/executionEnvironmentTransport').default)();
  const snapshots = [];
  for (const value of ['A', 'B']) {
    const task = await h.CrontabModel.create({ command: `task ${value}.sh` });
    await h.variables.save('task', task.id, [{ name: 'TEST_SCOPED_ENV', value }]);
    const resolved = await h.resolver.resolve(task.id);
    await h.variables.save('task', task.id, [{ name: 'TEST_SCOPED_ENV', value: 'next' }]);
    snapshots.push(resolved);
  }
  fs.writeFileSync(path.join(h.dir, 'data/scripts/check.sh'), 'printf "VALUE:%s\\n" "$TEST_SCOPED_ENV"');
  const before = process.env.TEST_SCOPED_ENV;
  // Bound OS process pressure while executing independent A/B snapshots concurrently.
  for (let batch = 0; batch < 5; batch++) await Promise.all(Array.from({ length: 10 }, async (_, index) => {
    const snapshot = await transport.prepare(snapshots[index % 2], process.pid);
    try { const r = await run(h, 'sh', snapshot); assert.equal(r.code, 0, r.output); assert.match(r.output, new RegExp(`VALUE:${index % 2 ? 'B' : 'A'}\\n`)); assert.doesNotMatch(r.output, /VALUE:next/); }
    finally { await snapshot.cleanup(); }
  }));
  assert.equal(process.env.TEST_SCOPED_ENV, before);
  assert.deepEqual(fs.readdirSync(path.join(h.dir, '.tmp/task-env')), []);
});
