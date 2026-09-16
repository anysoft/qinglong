// Local Darwin validation of the exact managed phase, in an owned clean checkout.
// Ubuntu apt/preflight/install bootstrap is reserved for the new hosted full run.
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const repository = path.resolve(__dirname, '../../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase16a-clean-'));
const checkout = path.join(root, 'checkout'),
  output = path.join(root, 'output');
const destination = path.join(__dirname, 'managed');
(async () => {
  let state, ci, evidence, failure;
  const report = {
    host: process.platform,
    validation:
      'managed phase after dependency installation; not Ubuntu bootstrap',
    static_build_preexisting: false,
  };
  try {
    execFileSync('git', ['clone', '--shared', '--quiet', repository, checkout]);
    const changed = execFileSync('git', ['diff', '--name-only', 'HEAD', '-z'], {
      cwd: repository,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
    for (const name of changed) {
      fs.mkdirSync(path.dirname(path.join(checkout, name)), {
        recursive: true,
      });
      fs.copyFileSync(path.join(repository, name), path.join(checkout, name));
    }
    fs.symlinkSync(
      path.join(repository, 'node_modules'),
      path.join(checkout, 'node_modules'),
      'dir',
    );
    assert.equal(fs.existsSync(path.join(checkout, 'static/build')), false);
    process.env.CI_OUTPUT = output;
    process.env.CI_JOB_NAME = 'managed-runtime';
    const context = require(path.join(checkout, 'scripts/ci/context.cjs'));
    ci = require(path.join(checkout, 'scripts/ci/ci.cjs'));
    evidence = require(path.join(checkout, 'scripts/ci/evidence.cjs'));
    state = context.context('managed-runtime');
    fs.mkdirSync(destination, { recursive: true });
    const fd = fs.openSync(
      path.join(destination, 'invocation.log'),
      'w',
      0o600,
    );
    let result;
    try {
      result = spawnSync('bash', ['scripts/ci/test-managed-runtime.sh'], {
        cwd: checkout,
        env: process.env,
        stdio: ['ignore', fd, fd],
        timeout: 7200000,
      });
    } finally {
      fs.closeSync(fd);
    }
    report.exit_code = result.status;
    const stage = (name) =>
      JSON.parse(fs.readFileSync(path.join(output, 'tests', name + '.json')));
    report.backend_build_executed = stage('backend-build').status === 'PASS';
    report.task_run_submit_exists_after_build = fs.existsSync(
      path.join(checkout, 'static/build/taskRunSubmit.js'),
    );
    report.build_before_provision =
      stage('backend-build').finished <= stage('provision-python').started;
    for (const [key, name] of [
      ['managed_environment', 'managed-environments'],
      ['managed_execution', 'managed-execution'],
      ['shell_execution', 'shell-execution'],
    ])
      report[key] = stage(name).status;
    assert.equal(
      result.status,
      0,
      'managed phase failed; inspect invocation and stage evidence',
    );
    assert.ok(
      report.build_before_provision &&
        report.task_run_submit_exists_after_build,
    );
  } catch (e) {
    failure = e;
    report.error = e.message;
  } finally {
    if (state) {
      try {
        require(path.join(checkout, 'scripts/ci/report-snapshots.cjs')).recover(
          state,
        );
        if (
          ['managed-node', 'managed-runtime'].some((name) =>
            fs.existsSync(path.join(output, 'runtime', name, 'result.json')),
          )
        )
          await require(path.join(checkout, 'scripts/ci/runner.cjs')).run(
            state,
            'managed-cleanup',
            [
              process.execPath,
              'diagnostics/phase12/cleanup-managed-fixtures.cjs',
            ],
            {},
            600,
          );
        state.status = failure ? 'FAIL' : 'PASS';
        const collected = evidence.collect(state);
        await ci.cleanup(state);
        const archive = evidence.pack(state);
        fs.cpSync(collected, path.join(destination, 'evidence'), {
          recursive: true,
        });
        fs.rmSync(path.join(destination, 'evidence/.owner'), { force: true });
        fs.mkdirSync(path.join(repository, 'ci-packages'), { recursive: true });
        fs.copyFileSync(
          archive,
          path.join(repository, 'ci-packages', path.basename(archive)),
        );
        report.artifact = 'ci-packages/' + path.basename(archive);
        report.secret_scrub = 'PASS';
        report.cleanup = 'PASS';
      } catch (e) {
        failure ||= e;
        report.cleanup_error = e.message;
      }
    }
    report.status = failure ? 'FAIL' : 'PASS';
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(
      path.join(destination, 'clean-state.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    if (!failure) fs.rmSync(root, { recursive: true, force: true });
    else console.error('Owned evidence retained for diagnosis:', root);
  }
  console.log(JSON.stringify(report));
  if (failure) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
