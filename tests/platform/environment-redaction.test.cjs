const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
test('streaming secret redaction preserves UTF-8 and masks literal and JSON-escaped multiline values', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-redact-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const secret = 'a.[秘密]\n"token"';
  await fs.writeFile(path.join(directory, 'snapshot.json'), JSON.stringify({secretNames: ['TOKEN'], variables: { TOKEN: secret }}));
  const child = spawn(process.execPath, ['shell/task_env_redact.cjs'], {env: {...process.env, QL_TASK_ENV_SNAPSHOT: directory}});
  let result = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => result += chunk);
  const finished = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`exit ${code}`))); });
  const input = Buffer.from(`😀前缀:${secret}:中间😀:${JSON.stringify(secret).slice(1, -1)}:尾巴😀`);
  for (const byte of input) { child.stdin.write(Buffer.from([byte])); await new Promise(resolve => setTimeout(resolve, 2)); }
  child.stdin.end();
  await finished;
  assert.equal(result, '😀前缀:********:中间😀:********:尾巴😀');
});
