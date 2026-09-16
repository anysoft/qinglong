const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const setup = require('../phase4/helpers.cjs');
test('cross-repository and same-repository profiles stay isolated with task overrides; next unscoped run has no residue', async t => {
  const h = await setup(t); 
  const resolved = [];
  for (const repoName of ['a', 'b']) {
    const repo = await h.RepositoryModel.create({ name: repoName, provider: 'generic', remote_url: `https://isolation.invalid/${repoName}`, normalized_url: `isolation.invalid/${repoName}` });
    const sub = await h.SubscriptionModel.create({ name: repoName, repository_id: repo.id });
    for (const profileName of ['prod', 'test']) {
      const profile = await h.profiles.save({ repository_id: repo.id, name: profileName });
      await h.variables.save('repository', profile.id, [{ name: 'PROFILE_VALUE', value: `${repoName}-${profileName}` }, { name: 'ACCOUNT_VALUE', value: 'repo' }]);
      const task = await h.SchedulerProjectionModel.create({ command: `task ${repoName}-${profileName}.sh`, sub_id: sub.id });
      await h.variables.bind('task', task.id, profile.id);
      await h.variables.save('task', task.id, [{ name: 'ACCOUNT_VALUE', value: `task-${task.id}` }]);
      resolved.push({ value: `${repoName}-${profileName}:task-${task.id}`, env: await h.resolver.resolve(task.id) });
    }
  }
  const script = path.join(h.dir, 'data/scripts/isolation.sh'); fs.writeFileSync(script, 'printf "VALUE:%s:%s\\n" "${PROFILE_VALUE-missing}" "${ACCOUNT_VALUE-missing}"');
  const transport = new (h.get('services/executionEnvironmentTransport').default)();
  const run = snapshot => new Promise((resolve, reject) => {
    const env = { ...process.env, QL_DIR: h.dir, QL_DATA_DIR: path.join(h.dir, 'data'), real_time: 'true', ID: '', ...(snapshot ? { QL_TASK_ENV_SNAPSHOT: snapshot.directory } : {}) };
    const cp = spawn(process.execPath, [path.resolve('tests/phase5/snapshot-main.cjs'), 'isolation.sh', 'now'], { env }); let out = '';
    cp.stdout.on('data', x => out += x); cp.stderr.on('data', x => out += x); cp.on('error', reject); cp.on('close', code => { assert.equal(code, 0, out); resolve(out); });
  });
  await Promise.all(resolved.map(async entry => { const snapshot = await transport.prepare(entry.env, process.pid); try { assert.ok((await run(snapshot)).includes(`VALUE:${entry.value}`)); } finally { await snapshot.cleanup(); } }));
  const globalOnly=await transport.prepare(await h.resolver.resolve(null),process.pid);try{assert.match(await run(globalOnly), /VALUE:missing:missing/);}finally{await globalOnly.cleanup();}
  assert.equal(process.env.PROFILE_VALUE, undefined); assert.equal(process.env.ACCOUNT_VALUE, undefined);
});
test('malformed scoped request JSON is never echoed by the HTTP error boundary', async t => {
  const h = await setup(t), express = require('express');
  const app = express(); app.use(express.json()); app.use(h.get('shared/scopedEnvHttp').scopedEnvironmentHttpError);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/scoped-env/profiles/1/variables`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"value":"private-malformed-secret",broken}' });
  const text = await r.text(); assert.equal(r.status, 400); assert.match(text, /ENV_REQUEST_INVALID/); assert.doesNotMatch(text, /private-malformed-secret/);
});
