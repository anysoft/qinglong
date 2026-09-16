const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const { atomic, repository, owned } = require('./context.cjs');
const maximum = 64 * 1024 * 1024;
function walk(root, visit, relative = '') {
  for (const e of fs.readdirSync(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const rel = path.join(relative, e.name),
      file = path.join(root, rel),
      st = fs.lstatSync(file);
    if (
      st.isSymbolicLink() ||
      (!st.isDirectory() && !st.isFile()) ||
      (st.isFile() && st.nlink !== 1)
    )
      throw Error('UNSAFE_DIAGNOSTIC_PATH');
    if (st.isDirectory()) walk(root, visit, rel);
    else visit(file, rel, st);
  }
}
function safeName(value) {
  assert.match(value, /^[A-Za-z0-9_.-]{1,100}$/);
  assert.ok(value !== '.' && value !== '..');
  return value;
}
function artifactDirectory(s) {
  return path.join(
    repository,
    'ci-artifacts',
    safeName(s.job) + '-' + safeName(s.run),
  );
}
function collect(s) {
  owned(s);
  for (const base of [
    path.join(repository, 'ci-artifacts'),
    path.join(repository, 'ci-packages'),
  ])
    if (fs.existsSync(base)) assert.ok(!fs.lstatSync(base).isSymbolicLink());
  const previous = path.join(
    repository,
    'ci-packages',
    `phase16a-${safeName(s.job)}-${safeName(s.run)}-${execFileSync(
      'git',
      ['rev-parse', '--short=12', 'HEAD'],
      { cwd: repository, encoding: 'utf8' },
    ).trim()}.tar.gz`,
  );
  fs.rmSync(previous, { force: true });
  const destination = artifactDirectory(s);
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  assert.ok(!fs.lstatSync(destination).isSymbolicLink());
  // This directory is wholly owned by this invocation, never an arbitrary supplied path.
  const marker = path.join(destination, '.owner');
  if (fs.existsSync(marker))
    assert.equal(fs.readFileSync(marker, 'utf8'), s.token);
  else {
    assert.equal(fs.readdirSync(destination).length, 0);
    fs.writeFileSync(marker, s.token, { mode: 0o600 });
  }
  for (const e of fs.readdirSync(destination))
    if (e !== '.owner')
      fs.rmSync(path.join(destination, e), { recursive: true, force: true });
  let values = [];
  const secretFile = path.join(s.root, 'canaries.json');
  if (!fs.existsSync(secretFile)) throw Error('CANARY_REGISTRY_MISSING');
  const secrets = JSON.parse(fs.readFileSync(secretFile));
  values = [
    ...secrets.values,
    ...require('./acceptance.cjs').labels.map(
      (label) =>
        'fixture-' +
        require('node:crypto')
          .createHmac('sha256', secrets.seed)
          .update(label)
          .digest('hex'),
    ),
  ];
  values.push(
    'TEST_SECRET_CANARY',
    'CONFIG_SECRET_E2E',
    'ENV_SECRET_E2E',
    'NOTIFICATION_SECRET_E2E',
    'UNIQUE_SUPER_SECRET_BACKUP_PASSPHRASE',
    'local-e2e-only-backend-secret',
  );
  const inventory = [],
    pending = [];
  let total = 0;
  let failure;
  try {
    const staticDir = path.join(s.output, 'static');
    if (fs.existsSync(staticDir))
      assert.ok(!fs.lstatSync(staticDir).isSymbolicLink());
    atomic(path.join(s.output, 'static/host.json'), {
      git_status: execFileSync('git', ['status', '--short'], {
        cwd: repository,
        encoding: 'utf8',
      }),
      disk: fs.statfsSync(s.root),
      memory: {
        total: require('node:os').totalmem(),
        free: require('node:os').freemem(),
      },
    });
    for (const category of [
      'logs',
      'tests',
      'runtime',
      'browser',
      'static',
      'cleanup',
    ]) {
      const source = path.join(s.output, category);
      if (!fs.existsSync(source)) continue;
      assert.ok(!fs.lstatSync(source).isSymbolicLink());
      walk(source, (file, relative, stat) => {
        const name = path.join(category, relative);
        for (const segment of relative.split(path.sep)) safeName(segment);
        if (values.filter(Boolean).some((value) => name.includes(value)))
          throw Error('SECRET_CANARY_DETECTED');
        assert.ok(
          !path.isAbsolute(relative) &&
            !relative.split(path.sep).includes('..'),
        );
        if (!/\.(json|log|txt|png)$/.test(relative))
          throw Error('UNAPPROVED_DIAGNOSTIC_TYPE');
        total += stat.size;
        inventory.push({ path: name, bytes: stat.size });
        if (total > maximum) throw Error('DIAGNOSTIC_SIZE_LIMIT');
        const data = fs.readFileSync(file);
        if (
          values.filter(Boolean).some((v) => data.includes(Buffer.from(v))) ||
          /-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/.test(
            data.toString('utf8'),
          )
        )
          throw Error('SECRET_CANARY_DETECTED');
        pending.push([name, data]);
      });
    }
    for (const name of [
      'preflight.json',
      'core-summary.json',
      'managed-summary.json',
      'browser-summary.json',
    ])
      if (fs.existsSync(path.join(s.output, name))) {
        const stat = fs.lstatSync(path.join(s.output, name));
        assert.ok(
          stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1,
          'UNSAFE_DIAGNOSTIC_PATH',
        );
        const data = fs.readFileSync(path.join(s.output, name));
        if (
          values.some((v) => data.includes(Buffer.from(v))) ||
          /-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/.test(
            data.toString('utf8'),
          )
        )
          throw Error('SECRET_CANARY_DETECTED');
        total += data.length;
        if (total > maximum) throw Error('DIAGNOSTIC_SIZE_LIMIT');
        pending.push([name, data]);
      }
  } catch (e) {
    failure = e.message;
  }
  // All-or-nothing publication: never copy a partial unsafe inventory.
  if (!failure)
    for (const [name, data] of pending) {
      const target = path.join(destination, name);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, data, { mode: 0o600 });
    }
  const summary = {
    phase: '16A',
    job: s.job,
    status: failure ? 'FAIL' : s.status || 'UNKNOWN',
    collection: failure ? 'BLOCKED' : 'PASS',
    error_code: failure || null,
    run_id: s.run,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim(),
    bytes: total,
    inventory: failure ? [] : inventory,
  };
  atomic(path.join(destination, 'ci-summary.json'), summary);
  atomic(path.join(s.output, 'collection.json'), summary);
  if (failure) throw Error(failure);
  return destination;
}
function pack(s) {
  const dir = artifactDirectory(s);
  assert.ok(!fs.lstatSync(dir).isSymbolicLink());
  const summary = JSON.parse(
    fs.readFileSync(path.join(dir, 'ci-summary.json')),
  );
  assert.equal(summary.collection, 'PASS');
  assert.equal(fs.readFileSync(path.join(dir, '.owner'), 'utf8'), s.token);
  let total = 0;
  walk(dir, (_f, _r, st) => {
    total += st.size;
    if (total > maximum) throw Error('DIAGNOSTIC_SIZE_LIMIT');
  });
  const output = path.join(repository, 'ci-packages');
  fs.mkdirSync(output, { recursive: true });
  assert.ok(!fs.lstatSync(output).isSymbolicLink());
  const name = `phase16a-${safeName(s.job)}-${safeName(
    s.run,
  )}-${summary.commit.slice(0, 12)}.tar.gz`;
  const target = path.join(output, name);
  const temporary = target + '.partial-' + require('node:crypto').randomUUID();
  fs.closeSync(fs.openSync(temporary, 'wx', 0o600));
  try {
    execFileSync('tar', [
      '-czf',
      temporary,
      '--exclude=.owner',
      '-C',
      dir,
      '.',
    ]);
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return target;
}
function summarize(needs, artifacts = {}) {
  const jobs = {};
  for (const [name, value] of Object.entries(needs)) {
    const blocked = needs.preflight && needs.preflight.result !== 'success';
    const planned =
      value.result === 'skipped' &&
      !blocked &&
      !['preflight', 'core'].includes(name);
    jobs[name] = {
      status: planned
        ? 'SKIPPED_BY_SCOPE'
        : value.result === 'skipped'
        ? 'SKIPPED_BY_DEPENDENCY'
        : value.result === 'success'
        ? 'PASS'
        : value.result.toUpperCase(),
      artifact:
        value.outputs?.upload === 'failure'
          ? 'ARTIFACT_UPLOAD_FAILED'
          : value.outputs?.upload || 'NOT_AVAILABLE',
      artifact_name: value.outputs?.artifact || null,
    };
  }
  const core = artifacts.core || {};
  const missing =
    !needs.core ||
    (needs.core.result === 'success' && (!core.tests || !core.typecheck));
  return {
    phase: '16A',
    commit: process.env.CI_COMMIT || null,
    runner: { os: 'ubuntu-24.04', arch: core.preflight?.arch || 'UNKNOWN' },
    jobs,
    tests: core.tests || null,
    typecheck: core.typecheck || { historical: 22, new: null },
    missing_core_evidence: !!missing,
    status:
      missing ||
      core.status === 'FAIL' ||
      core.tests?.fail > 0 ||
      core.typecheck?.new > 0 ||
      Object.values(jobs).some(
        (j) =>
          ['FAILURE', 'CANCELLED', 'SKIPPED_BY_DEPENDENCY'].includes(
            j.status,
          ) || j.artifact === 'ARTIFACT_UPLOAD_FAILED',
      )
        ? 'FAIL'
        : 'PASS',
    qualification: 'NOT_PHASE15_QUALIFICATION',
  };
}
module.exports = {
  walk,
  collect,
  pack,
  summarize,
  safeName,
  artifactDirectory,
};
