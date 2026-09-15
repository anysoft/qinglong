const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-discovery3-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const d of [
    'data/config',
    'data/scripts',
    'data/deps',
    'stage',
    'source',
  ])
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  fs.cpSync(path.join(root, 'fixtures/test-repo'), path.join(dir, 'source'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(dir, 'data/config/config.sh'),
    "DefaultCronRule='0 0 * * *'\n",
  );
  for (const f of ['sendNotify.js', 'notify.py'])
    fs.writeFileSync(path.join(dir, 'data/scripts', f), '');
  fs.writeFileSync(path.join(dir, 'stage/crontab.list'), '');
  return {
    dir,
    run: (
      include = '',
      exclude = '',
      deps = '',
      ext = 'js|py|sh',
      add = 'true',
      del = 'true',
    ) =>
      spawnSync(
        '/bin/bash',
        [
          path.join(root, 'shell/managed_discovery.sh'),
          path.join(dir, 'source'),
          path.join(dir, 'stage'),
          'team_project_main',
          include,
          exclude,
          deps,
          ext,
          add,
          del,
        ],
        {
          env: {
            ...process.env,
            QL_DIR: root,
            QL_DATA_DIR: path.join(dir, 'data'),
            SUB_ID: '42',
          },
          encoding: 'utf8',
        },
      ),
  };
}
test('staging uses original discovery metadata and leaves live scripts unchanged', (t) => {
  const { dir, run } = fixture(t);
  const r = run();
  assert.equal(r.status, 0, r.stderr + '\n' + r.stdout);
  const adds = fs
    .readFileSync(path.join(dir, 'stage/add.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(adds.length, 4);
  assert.ok(adds.every((x) => x.command.startsWith('task team_project_main/')));
  assert.ok(
    adds.some((x) => x.name === 'phase0-python' && x.schedule === '7 8 * * *'),
  );
  assert.deepEqual(fs.readdirSync(path.join(dir, 'data/scripts')).sort(), [
    'notify.py',
    'sendNotify.js',
  ]);
});
test('invalid regular expression fails before publishing', (t) => {
  const { run } = fixture(t);
  assert.notEqual(run('[').status, 0);
});
test('autoAddCron=false still copies scripts', (t) => {
  const { dir, run } = fixture(t);
  const r = run('', '', '', 'js|py|sh', 'false');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(dir, 'stage/add.jsonl'), 'utf8'), '');
  assert.ok(
    fs.existsSync(
      path.join(dir, 'stage/scripts/team_project_main/python/example.py'),
    ),
  );
});
test('extensions, include/exclude, dependency copy and nested TypeScript keep old scanner semantics', (t) => {
  const { dir, run } = fixture(t);
  fs.mkdirSync(path.join(dir, 'source/nested'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'source/nested/tool.ts'),
    '// cron: 1 2 * * *\n// new Env("ts-tool")\n',
  );
  fs.writeFileSync(path.join(dir, 'source/skip.ts'), '// cron: 1 2 * * *\n');
  fs.writeFileSync(
    path.join(dir, 'source/support.py'),
    'print("dependency")\n',
  );
  const result = run('tool|skip', 'skip', 'support', 'ts|py');
  assert.equal(result.status, 0, result.stderr);
  const adds = fs
    .readFileSync(path.join(dir, 'stage/add.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.equal(adds.length, 1);
  assert.equal(adds[0].name, 'ts-tool');
  assert.equal(adds[0].command, 'task team_project_main/nested/tool.ts');
  assert.ok(
    fs.existsSync(path.join(dir, 'stage/scripts/team_project_main/support.py')),
  );
  assert.equal(
    fs.existsSync(path.join(dir, 'stage/scripts/team_project_main/skip.ts')),
    false,
  );
});
for (const autoDel of ['true', 'false'])
  test(`autoDelCron=${autoDel} retains original removal semantics`, (t) => {
    const { dir, run } = fixture(t);
    const old = path.join(dir, 'stage/scripts/team_project_main/old.py');
    fs.mkdirSync(path.dirname(old), { recursive: true });
    fs.writeFileSync(old, '# new Env("old")\n');
    fs.writeFileSync(
      path.join(dir, 'stage/crontab.list'),
      '0 0 * * * real_time=false no_tee=true ID=7 task team_project_main/old.py\n',
    );
    const result = run('', '', '', 'js|py|sh', 'false', autoDel);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(old), autoDel === 'false');
    const drops = fs.readFileSync(path.join(dir, 'stage/drop.jsonl'), 'utf8');
    if (autoDel === 'true') assert.deepEqual(JSON.parse(drops), ['7']);
    else assert.equal(drops, '');
  });
