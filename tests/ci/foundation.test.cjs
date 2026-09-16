const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  crypto = require('node:crypto');
const { context, repository } = require('../../scripts/ci/context.cjs'),
  {
    collect,
    pack,
    summarize,
    safeName,
    artifactDirectory,
  } = require('../../scripts/ci/evidence.cjs'),
  { tap, cleanup } = require('../../scripts/ci/ci.cjs');
test('strict summary rejects historical budgets, nonzero diagnostics and failed raw compiler', () => {
  const needs = { core: { result: 'success', outputs: { upload: 'success' } } };
  for (const typecheck of [
    { status: 'PASS', baseline: 22, remaining: 4, new: 0 },
    { mode: 'STRICT_ZERO', status: 'PASS', errors: 1, raw_failed: false },
    { mode: 'STRICT_ZERO', status: 'PASS', errors: 0, raw_failed: true },
  ]) {
    assert.equal(summarize(needs, { core: { status: 'PASS', tests: { tests: 1, pass: 1, fail: 0, skipped: 0 }, typecheck } }).status, 'FAIL');
  }
});
function fixture(t) {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-evidence-test-'));
  const previous = process.env.CI_OUTPUT;
  process.env.CI_OUTPUT = output;
  let s;
  try {
    s = context('test-' + crypto.randomBytes(5).toString('hex'));
  } finally {
    if (previous === undefined) delete process.env.CI_OUTPUT;
    else process.env.CI_OUTPUT = previous;
  }
  t.after(() => {
    fs.rmSync(s.root, { recursive: true, force: true });
    fs.rmSync(output, { recursive: true, force: true });
    fs.rmSync(artifactDirectory(s), {
      recursive: true,
      force: true,
    });
    for (const f of fs.existsSync('ci-packages')
      ? fs.readdirSync('ci-packages')
      : [])
      if (f.startsWith('phase16a-' + s.job + '-'))
        fs.rmSync(path.join('ci-packages', f));
  });
  fs.mkdirSync(path.join(output, 'logs'));
  return s;
}
test('failed test still collects and packages bounded diagnostics with machine summary', (t) => {
  const s = fixture(t);
  s.status = 'FAIL';
  fs.writeFileSync(
    path.join(s.output, 'logs/test.log'),
    'not ok 1 - fixture failure\n',
  );
  const dir = collect(s);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(dir, 'ci-summary.json'))).status,
    'FAIL',
  );
  assert.ok(fs.statSync(pack(s)).size > 0);
});
test('canary rejects publication and invalidates a previous archive', (t) => {
  const s = fixture(t);
  fs.writeFileSync(path.join(s.output, 'logs/test.log'), 'safe');
  collect(s);
  const archive = pack(s);
  fs.writeFileSync(path.join(s.output, 'logs/test.log'), 'TEST_SECRET_CANARY');
  assert.throws(() => collect(s), /SECRET_CANARY/);
  assert.ok(!fs.existsSync(archive));
  assert.throws(() => pack(s));
  assert.ok(!fs.existsSync(path.join(artifactDirectory(s), 'logs/test.log')));
});
test('random fixture secrets and private keys are blocked', (t) => {
  const s = fixture(t),
    r = JSON.parse(fs.readFileSync(path.join(s.root, 'canaries.json')));
  const value =
    'fixture-' +
    crypto
      .createHmac('sha256', r.seed)
      .update('CONFIG_SECRET_E2E')
      .digest('hex');
  fs.writeFileSync(path.join(s.output, 'logs/test.log'), value);
  assert.throws(() => collect(s), /SECRET_CANARY/);
  fs.writeFileSync(
    path.join(s.output, 'logs/test.log'),
    '-----BEGIN OPENSSH PRIVATE KEY-----',
  );
  assert.throws(() => collect(s), /SECRET_CANARY/);
});
test('artifact paths reject traversal, symlinks, operational DB and oversized logs', (t) => {
  const s = fixture(t);
  assert.throws(() => safeName('../../outside'));
  const previous = process.env.CI_OUTPUT;
  try {
    for (const value of ['../../escape', '/etc/ci-escape']) {
      process.env.CI_OUTPUT = value;
      assert.throws(() => context('invalid'));
    }
  } finally {
    if (previous === undefined) delete process.env.CI_OUTPUT;
    else process.env.CI_OUTPUT = previous;
  }

  fs.symlinkSync('/etc/passwd', path.join(s.output, 'logs/escape.log'));
  assert.throws(() => collect(s));
  fs.unlinkSync(path.join(s.output, 'logs/escape.log'));
  fs.writeFileSync(path.join(s.output, 'logs/database.sqlite'), 'data');
  assert.throws(() => collect(s), /UNAPPROVED/);
  fs.unlinkSync(path.join(s.output, 'logs/database.sqlite'));
  const fd = fs.openSync(path.join(s.output, 'logs/large.log'), 'w');
  fs.ftruncateSync(fd, 65 * 1024 * 1024);
  fs.closeSync(fd);
  assert.throws(() => collect(s), /SIZE_LIMIT/);
});
test('cleanup rejects foreign roots and is idempotent for its owned root', async (t) => {
  const s = fixture(t);
  await assert.rejects(() => cleanup({ ...s, root: '/' }));
  await cleanup(s);
  await cleanup(s);
  assert.ok(!fs.existsSync(s.root));
});
test('summary derives counts and exposes failures, cancellations, scope skips and upload failures', () => {
  const tests = tap('# tests 901\n# pass 900\n# fail 1\n# skipped 0\n');
  assert.equal(tests.tests, 901);
  assert.throws(() => tap('process died'));
  const report = summarize(
    {
      core: { result: 'failure', outputs: { upload: 'failure' } },
      browser: { result: 'cancelled' },
      runtime: { result: 'skipped' },
    },
    { core: { tests, typecheck: { mode: 'STRICT_ZERO', errors: 0, raw_failed: false, status: 'PASS' } } },
  );
  assert.equal(report.status, 'FAIL');
  assert.equal(report.jobs.core.artifact, 'ARTIFACT_UPLOAD_FAILED');
  assert.equal(report.jobs.runtime.status, 'SKIPPED_BY_SCOPE');
  assert.equal(report.tests.fail, 1);
});
test('workflow parses and uses read-only fixed Ubuntu official-action orchestration', () => {
  assert.equal(require('../../scripts/ci/static.cjs').audit().status, 'PASS');
});

test('summary cannot turn blocked core or missing successful-core evidence into PASS', () => {
  const blocked = summarize({
    preflight: { result: 'failure' },
    core: { result: 'skipped' },
  });
  assert.equal(blocked.jobs.core.status, 'SKIPPED_BY_DEPENDENCY');
  assert.equal(blocked.status, 'FAIL');
  assert.equal(summarize({ core: { result: 'success' } }).status, 'FAIL');
  const report = summarize(
    {
      core: {
        result: 'success',
        outputs: { upload: 'success', artifact: 'linux-core-fixture' },
      },
    },
    {
      core: {
        status: 'PASS',
        tests: { tests: 3, pass: 3, fail: 0, skipped: 0 },
        typecheck: { mode: 'STRICT_ZERO', errors: 0, raw_failed: false, status: 'PASS' },
      },
    },
  );
  assert.equal(report.status, 'PASS');
  assert.equal(report.jobs.core.artifact_name, 'linux-core-fixture');
});
test('supervised stage timeout stops owned child and grandchild and retains failure evidence', async (t) => {
  const s = fixture(t),
    pidFile = path.join(s.root, 'pids.json');
  const program = `const fs=require('fs'),{spawn}=require('child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);`;
  await assert.rejects(
    () =>
      require('../../scripts/ci/runner.cjs').run(
        s,
        'timeout-fixture',
        [process.execPath, '-e', program, pidFile],
        {},
        1,
      ),
    /STAGE_FAILED/,
  );
  const pids = JSON.parse(fs.readFileSync(pidFile));
  s.status = 'FAIL';
  collect(s);
  await cleanup(s);
  for (const pid of pids) {
    let state = '';
    try {
      state = require('child_process')
        .execFileSync('ps', ['-p', String(pid), '-o', 'stat='], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        .trim();
    } catch {}
    assert.ok(!state || state.startsWith('Z'), 'owned process remains alive');
  }
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(s.output, 'tests/timeout-fixture.json')),
    ).exit_code,
    124,
  );
  assert.ok(fs.existsSync(pack(s)));
});

test('managed clean checkout builds real backend before provision and preserves failure summary', (t) => {
  const s = fixture(t),
    checkout = path.join(s.root, 'checkout');
  fs.mkdirSync(path.join(checkout, 'scripts'), { recursive: true });
  for (const name of ['back', 'shell', 'sample', 'scripts/ci'])
    fs.cpSync(path.join(repository, name), path.join(checkout, name), {
      recursive: true,
    });
  fs.copyFileSync(
    path.join(repository, 'scripts/build-back.cjs'),
    path.join(checkout, 'scripts/build-back.cjs'),
  );
  fs.symlinkSync(
    path.join(repository, 'node_modules'),
    path.join(checkout, 'node_modules'),
    'dir',
  );
  assert.equal(fs.existsSync(path.join(checkout, 'static/build')), false);
  const probe = path.join(checkout, 'probe.cjs');
  // Run the actual backend compiler. Only provision is replaced with a real
  // failed child stage, avoiding network downloads in this foundation test.
  fs.writeFileSync(
    probe,
    `
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const runner = require('./scripts/ci/runner.cjs'), original = runner.run;
runner.run = async (s, name, args, extra, seconds) => {
  if (name === 'provision-python') {
    assert.ok(fs.existsSync(path.join(__dirname, 'static/build/taskRunSubmit.js')), 'taskRunSubmit missing before provision');
    assert.equal(JSON.parse(fs.readFileSync(path.join(s.output, 'tests/backend-build.json'))).status, 'PASS');
    return original(s, name, [process.execPath, '-e', 'process.exit(23)'], extra, seconds);
  }
  return original(s, name, args, extra, seconds);
};
`,
  );
  const output = path.join(s.output, 'clean-managed');
  const result = require('node:child_process').spawnSync(
    process.execPath,
    ['-r', probe, 'scripts/ci/ci.cjs', 'managed'],
    {
      cwd: checkout,
      env: {
        ...process.env,
        CI_OUTPUT: output,
        CI_JOB_NAME: 'managed-runtime',
      },
      encoding: 'utf8',
      timeout: 120000,
    },
  );
  // The nested CI owns a separate temporary root; never leave it after failure.
  const state = path.join(output, '.state.json');
  if (fs.existsSync(state)) {
    const nested = JSON.parse(fs.readFileSync(state));
    t.after(async () => {
      await cleanup(nested);
      fs.rmSync(s.output, { recursive: true, force: true });
    });
  }
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /STAGE_FAILED: provision-python/);
  assert.ok(
    fs.existsSync(path.join(checkout, 'static/build/taskRunSubmit.js')),
  );
  const summary = JSON.parse(
    fs.readFileSync(path.join(output, 'managed-summary.json')),
  );
  assert.equal(summary.status, 'FAIL');
  assert.equal(summary.failed_stage, 'provision-python');
  assert.equal(summary.backend_build.status, 'PASS');
  for (const name of ['environment', 'execution', 'shell'])
    assert.equal(summary[name].status, 'NOT_RUN');
  assert.equal(
    fs.existsSync(path.join(output, 'tests/frontend-build.json')),
    false,
  );
});

test('managed and browser preserve build failure evidence and reject missing TAP summaries', (t) => {
  const s = fixture(t),
    checkout = path.join(s.root, 'checkout');
  fs.mkdirSync(path.join(checkout, 'scripts'), { recursive: true });
  fs.cpSync(
    path.join(repository, 'scripts/ci'),
    path.join(checkout, 'scripts/ci'),
    { recursive: true },
  );
  const probe = path.join(checkout, 'probe.cjs');
  fs.writeFileSync(
    probe,
    `
const runner = require('./scripts/ci/runner.cjs'), original = runner.run;
runner.run = (s, name) => original(s, name, [process.execPath, '-e', process.env.CI_EMPTY_TAP === '1' ? 'process.exit(0)' : 'process.exit(24)']);
`,
  );
  fs.cpSync(path.join(repository, 'shell'), path.join(checkout, 'shell'), {
    recursive: true,
  });
  for (const [action, emptyTap] of [
    ['managed', false],
    ['browser', false],
    ['managed', true],
  ]) {
    const output = path.join(s.output, action + (emptyTap ? '-empty' : ''));
    const result = require('node:child_process').spawnSync(
      process.execPath,
      ['-r', probe, 'scripts/ci/ci.cjs', action],
      {
        cwd: checkout,
        env: {
          ...process.env,
          CI_OUTPUT: output,
          CI_EMPTY_TAP: emptyTap ? '1' : '0',
        },
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    const nested = JSON.parse(
      fs.readFileSync(path.join(output, '.state.json')),
    );
    t.after(async () => {
      await cleanup(nested);
      fs.rmSync(s.output, { recursive: true, force: true });
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const summary = JSON.parse(
      fs.readFileSync(path.join(output, action + '-summary.json')),
    );
    assert.equal(summary.status, 'FAIL');
    if (emptyTap) {
      assert.equal(summary.failed_stage, 'managed-environments');
      assert.equal(summary.backend_build.status, 'PASS');
      assert.equal(summary.environment.tests, null);
      assert.match(result.stderr, /TAP_SUMMARY_MISSING/);
      continue;
    }
    assert.equal(summary.failed_stage, 'backend-build');
    assert.equal(summary.backend_build.exit_code, 24);
    assert.equal(summary.backend_build.status, 'FAIL');
    if (action === 'managed') assert.equal(summary.shell.status, 'NOT_RUN');
    else
      for (const scenario of summary.scenarios)
        assert.equal(scenario.status, 'NOT_RUN');
  }
});
