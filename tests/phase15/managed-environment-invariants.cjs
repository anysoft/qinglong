const assert = require('node:assert/strict'), fs = require('node:fs/promises'), path = require('node:path');
const { task, wait } = require('../phase10/helpers.cjs');
module.exports = async function managedEnvironmentInvariants(h, runtime, language) {
  const values = { EMPTY: '', SPACE: ' around ', UNICODE: '中文😀', SPECIAL: `a=b&$'"`, JSON: '{"a":"b=c"}', MULTILINE: 'line1\nline2\n', URL: 'https://a.invalid/?a=b&c=d', INJECTION: '$(touch pwned)`touch pwned`', LONG: 'x'.repeat(16000), TOKEN: 'formal-managed-private-secret' };
  const names = [...Object.keys(values), 'REMOVE', 'JWT_SECRET', 'BACKEND_TOKEN'];
  const python = language === 'PYTHON';
  const code = python
    ? `import os,json\nwith open('env-result.json','w') as f: json.dump({k:os.environ[k] for k in ${JSON.stringify(names)} if k in os.environ},f)\nprint(os.environ['TOKEN'])\n`
    : `import fs from 'node:fs';fs.writeFileSync('env-result.json',JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.filter(k=>k in process.env).map(k=>[k,process.env[k]]))));console.log(process.env.TOKEN);`;
  const f = await task(h, code, {}, { runtime, language, entry: 'complex.' + (python ? 'py' : language === 'TYPESCRIPT' ? 'ts' : 'mjs') });
  await h.EnvModel.upsert({ name: 'REMOVE', value: 'global', status: 0 });
  await h.TaskEnvVariableModel.bulkCreate([
    ...Object.entries(values).map(([name, value]) => ({ task_id: f.definition.id, name, value, is_secret: name === 'TOKEN' })),
    { task_id: f.definition.id, name: 'REMOVE', operation: 'UNSET' },
  ]);
  const run = await h.execution.submit(f.definition.id);
  const result = await wait(h, run.id, 30000);
  assert.equal(result.status, 'SUCCESS', JSON.stringify(result));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root, 'env-result.json'), 'utf8')), values);
  const log = await h.execution.log(run.id);
  assert.ok(!log.includes(values.TOKEN)); assert.match(log, /\*{8}/);
  await assert.rejects(fs.stat(path.join(f.root, 'pwned')), { code: 'ENOENT' });
};
