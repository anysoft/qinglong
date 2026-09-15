const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const setup = require('../phase4/helpers.cjs');
for (const language of ['sh', 'js', 'py']) test(`scoped ${language} account concurrency keeps split secrets in private temporary logs`, async t => {
  const h = await setup(t); 
  const task = await h.CrontabModel.create({ command: `task accounts.${language}` });
  await h.variables.save('task', task.id, [{ name: 'ACCOUNTS', value: 'private-account-one&private-account-two', is_secret: true }]);
  const snapshot = await new (h.get('services/executionEnvironmentTransport').default)().prepare(await h.resolver.resolve(task.id), process.pid);
  const scripts = { sh: 'printf "ACCOUNT:%s\\n" "$ACCOUNTS"', js: 'console.log("ACCOUNT:"+process.env.ACCOUNTS)', py: 'import os\nprint("ACCOUNT:"+os.environ["ACCOUNTS"])' };
  fs.writeFileSync(path.join(h.dir, `data/scripts/accounts.${language}`), scripts[language]);
  const output = await new Promise((resolve, reject) => {
    const cp = spawn('/bin/bash', [path.join(h.dir, 'shell/task.sh'), `accounts.${language}`, 'conc', 'ACCOUNTS'], { env: { ...process.env, QL_DIR: h.dir, QL_DATA_DIR: path.join(h.dir, 'data'), real_time: 'true', ID: '', QL_TASK_ENV_SNAPSHOT: snapshot.directory } });
    let out = ''; cp.stdout.on('data', x => out += x); cp.stderr.on('data', x => out += x); cp.on('error', reject); cp.on('close', code => { assert.equal(code, 0, out); resolve(out); });
  });
  assert.doesNotMatch(output, /private-account/); assert.equal(output.match(/ACCOUNT:\*{8}/g)?.length, 2, output);
  assert.ok(!fs.readdirSync(snapshot.directory).some(name => name.startsWith('account-')));
  const logs = fs.readdirSync(path.join(h.dir, 'data/log'), { recursive: true }).filter(f => f.endsWith('.log'));
  for (const file of logs) assert.doesNotMatch(fs.readFileSync(path.join(h.dir, 'data/log', file), 'utf8'), /private-account/);
  await snapshot.cleanup();
});
