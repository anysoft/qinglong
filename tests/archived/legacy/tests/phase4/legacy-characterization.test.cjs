const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const setup = require('./helpers.cjs');
for (const language of ['sh', 'js', 'py']) test(`pre-integration characterization: actual task.sh ${language} duplicates, disabled host fallback, spaces, templates`, async t => {
  const h = await setup(t);
  await h.EnvModel.bulkCreate([
    { name: 'DUP', value: 'A', status: 0, position: 2 }, { name: 'DUP', value: 'B', status: 0, position: 1 },
    { name: 'DISABLED', value: 'hidden', status: 1 }, { name: 'SPACES', value: ' A ', status: 0 },
    { name: 'TEMPLATE', value: '${6*7}', status: 0 },
  ]);
  await h.globals.set_envs();
  const source = { sh: 'printf "RESULT:%s|%s|%s|%s\\n" "$DUP" "$DISABLED" "$SPACES" "$TEMPLATE"', js: 'console.log("RESULT:"+["DUP","DISABLED","SPACES","TEMPLATE"].map(k=>process.env[k]).join("|"))', py: 'import os\nprint("RESULT:"+"|".join(os.environ[k] for k in ["DUP","DISABLED","SPACES","TEMPLATE"]))' };
  fs.writeFileSync(path.join(h.dir, `data/scripts/check.${language}`), source[language]);
  const r = spawnSync('/bin/bash', [path.join(h.dir, 'shell/task.sh'), `check.${language}`, 'now'], { encoding: 'utf8', timeout: 15000, env: { ...process.env, QL_DIR: h.dir, QL_DATA_DIR: path.join(h.dir, 'data'), DISABLED: 'host', real_time: 'true', ID: '' } });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(`RESULT:A&B|host|${language === 'sh' ? 'A' : ' A '}|${language === 'js' ? '42' : '${6*7}'}`), r.stdout);
});
