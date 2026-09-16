const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const repository = path.resolve(__dirname, '../..');
function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + '.' + crypto.randomUUID();
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', {
    mode: 0o600,
    flag: 'wx',
  });
  fs.renameSync(tmp, file);
}
function context(job = 'local') {
  assert.match(job, /^[a-z][a-z0-9-]{0,30}$/);
  const configured =
    process.env.CI_OUTPUT || path.join(repository, 'diagnostics/ci');
  assert.ok(
    path.isAbsolute(configured) && !configured.split(path.sep).includes('..'),
    'UNSAFE_OUTPUT_PATH',
  );
  const output = path.resolve(configured);
  const bases = [
    path.join(repository, 'diagnostics'),
    os.tmpdir(),
    fs.realpathSync(os.tmpdir()),
  ];
  const base = bases.find((root) =>
    output.startsWith(root.replace(/\/$/, '') + path.sep),
  );
  assert.ok(base, 'OUTPUT_OUTSIDE_DIAGNOSTICS_OR_TEMP');
  let cursor = base;
  for (const segment of path.relative(base, output).split(path.sep)) {
    cursor = path.join(cursor, segment);
    if (fs.existsSync(cursor))
      assert.ok(!fs.lstatSync(cursor).isSymbolicLink(), 'SYMLINK_OUTPUT');
    else fs.mkdirSync(cursor, { mode: 0o700 });
  }
  const file = path.join(output, '.state.json');
  let state;
  if (fs.existsSync(file)) {
    assert.ok(!fs.lstatSync(file).isSymbolicLink());
    state = JSON.parse(fs.readFileSync(file));
    assert.equal(state.repository, repository);
    assert.equal(state.output, output);
  } else {
    const root = fs.mkdtempSync(
      path.join(fs.realpathSync(os.tmpdir()), 'pci-'),
    );
    fs.chmodSync(root, 0o700);
    state = {
      schema: 1,
      repository,
      output,
      root,
      job,
      token: crypto.randomUUID(),
      run: process.env.CI_RUN_ID || Date.now().toString(),
      created: new Date().toISOString(),
    };
    assert.match(state.run, /^[A-Za-z0-9_.-]{1,80}$/);
    for (const d of ['tmp', 'home', 'ql', 'tools'])
      fs.mkdirSync(path.join(root, d), { mode: 0o700 });
    fs.writeFileSync(path.join(root, '.owner'), state.token, { mode: 0o600 });
    fs.writeFileSync(
      path.join(root, 'ql/.env'),
      'JWT_SECRET=' + crypto.randomBytes(32).toString('hex') + '\n',
      { mode: 0o600 },
    );
    for (const d of ['shell', 'sample'])
      fs.symlinkSync(path.join(repository, d), path.join(root, 'ql', d));
    atomic(path.join(root, 'canaries.json'), {
      seed: crypto.randomBytes(32).toString('hex'),
      values: [],
    });
    atomic(file, state);
  }
  return state;
}
function owned(state) {
  assert.match(path.basename(state.root), /^pci-[A-Za-z0-9]+$/);
  assert.equal(path.dirname(state.root), fs.realpathSync(os.tmpdir()));
  assert.ok(!fs.lstatSync(state.root).isSymbolicLink());
  assert.equal(
    fs.readFileSync(path.join(state.root, '.owner'), 'utf8'),
    state.token,
  );
  return state.root;
}
function environment(s) {
  owned(s);
  const env = {};
  for (const k of [
    'PATH',
    'LANG',
    'LC_ALL',
    'TZ',
    'TERM',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
  ])
    if (process.env[k] && !/PROXY/.test(k)) env[k] = process.env[k];
  Object.assign(env, {
    HOME: path.join(s.root, 'home'),
    TMPDIR: path.join(s.root, 'tmp'),
    TMP: path.join(s.root, 'tmp'),
    TEMP: path.join(s.root, 'tmp'),
    QL_DIR: path.join(s.root, 'ql'),
    TS_NODE_PROJECT: path.join(repository, 'back/tsconfig.json'),
    CI_OUTPUT: s.output,
    QL_MANAGED_DIR: path.join(s.output, 'runtime'),
    QL_ACCEPTANCE_CANARIES: path.join(s.root, 'canaries.json'),
    QL_BROWSER_RUNTIME: path.join(s.root, 'tools/node_modules'),
    CI: 'true',
  });
  return env;
}
module.exports = { repository, context, owned, environment, atomic };
