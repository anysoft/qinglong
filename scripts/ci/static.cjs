const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process'),
  yaml = require('js-yaml');
function audit() {
  const file = '.github/workflows/linux-ci.yml',
    text = fs.readFileSync(file, 'utf8'),
    workflow = yaml.load(text);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  for (const trigger of [
    'workflow_dispatch',
    'pull_request',
    'push',
    'workflow_call',
  ])
    assert.ok(trigger in workflow.on);
  assert.ok(!('pull_request_target' in workflow.on));
  assert.ok(
    !/secrets\.|contents:\s*write|packages:\s*write|id-token:\s*write|ubuntu-latest|docker\/|gh release/.test(
      text,
    ),
  );
  for (const job of Object.values(workflow.jobs)) {
    assert.equal(job['runs-on'], 'ubuntu-24.04');
    assert.ok(job['timeout-minutes'] > 0);
    for (const step of job.steps || []) {
      if (step.uses)
        assert.match(
          step.uses,
          /^actions\/(checkout|setup-node|upload-artifact|download-artifact)@v\d+(?:\.\d+)*$/,
        );
      if (step.run) assert.ok(!/\$\{\{/.test(step.run));
    }
  }
  for (const [name, summary] of Object.entries({
    preflight: 'preflight.json',
    core: 'core-summary.json',
    'managed-runtime': 'managed-summary.json',
    browser: 'browser-summary.json',
  })) {
    const job = workflow.jobs[name];
    if (name !== 'preflight') assert.equal(job.needs, 'preflight');
    const upload = job.steps.find((step) => step.id === 'artifact');
    assert.equal(upload.with['retention-days'], 30);
    assert.equal(upload.if, 'always()');
    for (const expected of [
      'ci-packages/*.tar.gz',
      `ci-artifacts/${name}-*/ci-summary.json`,
      `ci-artifacts/${name}-*/${summary}`,
    ])
      assert.ok(upload.with.path.split('\n').includes(expected));
    assert.equal(
      job.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with[
        'persist-credentials'
      ],
      false,
    );
    assert.ok(
      !job.steps.some((step) =>
        step.uses?.startsWith('actions/download-artifact@'),
      ),
    );
  }
  const ciSource = fs.readFileSync('scripts/ci/ci.cjs', 'utf8');
  assert.match(
    ciSource,
    /async function managed\(s\)[\s\S]*?await buildBackend\(s\);\s*await provision\(s\);/,
  );
  const orchestration =
    text +
    fs
      .readdirSync('scripts/ci')
      .filter((name) => /\.(?:sh|cjs)$/.test(name) && name !== 'static.cjs')
      .map((name) => fs.readFileSync(path.join('scripts/ci', name), 'utf8'))
      .join('\n');
  assert.ok(
    !/(?:npm|pnpm)\s+(?:install|add)\s+[^\n]*(?:-g|--global)[^\n]*ts-node/.test(
      orchestration,
    ),
  );
  assert.ok(!/PATH[^\n]*node_modules\/\.bin/.test(orchestration));
  assert.equal(
    execFileSync('git', ['ls-files', '--', 'static/build/taskRunSubmit.js'], {
      encoding: 'utf8',
    }).trim(),
    '',
  );
  const diagnosticTest = fs.readFileSync(
    'tests/platform/environment-execution.test.cjs',
    'utf8',
  );
  assert.ok(!/\bskip\b/.test(diagnosticTest));
  const guardEnv = { ...process.env };
  delete guardEnv.PLATFORM_RECOVERY_TEST_ONLY;
  const guard = require('node:child_process').spawnSync(
    'bash',
    ['shell/otask.sh'],
    { env: guardEnv, encoding: 'utf8' },
  );
  assert.equal(guard.status, 64);
  assert.match(guard.stderr, /LEGACY_EXECUTION_DISABLED/);
  const scripts = fs.readdirSync('scripts/ci').filter((f) => f.endsWith('.sh'));
  for (const name of scripts) {
    const f = 'scripts/ci/' + name,
      s = fs.readFileSync(f, 'utf8');
    assert.ok(s.startsWith('#!/usr/bin/env bash\nset -Eeuo pipefail'));
    assert.ok(!/pkill|killall|set -x|curl.*\|.*(?:sh|bash)/.test(s));
    execFileSync('bash', ['-n', f]);
  }
  let shellcheck = 'UNAVAILABLE';
  try {
    execFileSync('shellcheck', ['--version'], { stdio: 'pipe' });
    execFileSync(
      'shellcheck',
      ['-x', '-e', 'SC1091', ...scripts.map((f) => 'scripts/ci/' + f)],
      { stdio: 'pipe' },
    );
    shellcheck = 'PASS';
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (process.platform === 'linux') assert.equal(shellcheck, 'PASS');
  return {
    status: 'PASS',
    workflow: file,
    shellcheck,
    bash_syntax: 'PASS',
    permissions: 'contents: read',
    custom_secrets: 0,
    isolated_managed_build: 'PASS',
    job_summary_paths: 'PASS',
    diagnostic_only_ts_resolution: 'PASS',
    legacy_normal_exit: guard.status,
  };
}
if (require.main === module) {
  try {
    const report = audit();
    const out = process.env.CI_OUTPUT || 'diagnostics/ci';
    fs.mkdirSync(path.join(out, 'static'), { recursive: true });
    fs.writeFileSync(
      path.join(out, 'static/audit.json'),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
module.exports = { audit };
