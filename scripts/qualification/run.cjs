// Linux qualification composes the existing CI runner, isolation and scrubber.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { context, atomic } = require('../ci/context.cjs');
const { run } = require('../ci/runner.cjs');
const { preflight, tap, cleanup } = require('../ci/ci.cjs');
const evidence = require('../ci/evidence.cjs');
const suites = {
  native: ['tests/phase15/native-semantics.test.cjs', 'tests/phase15/fd-exec.test.cjs', 'tests/phase15/socket-recovery.test.cjs'],
  execution: ['tests/phase15/convergence.test.cjs', 'tests/phase15/formal-lifecycle.test.cjs', 'tests/phase15/formal-environment.test.cjs', 'tests/phase10/execution.test.cjs', 'tests/phase10/recovery.test.cjs', 'tests/phase10/hardening.test.cjs', 'tests/phase10/entrypoints.test.cjs'],
  triggers: ['tests/phase15/disabled-cron.test.cjs', 'tests/phase11/cron.test.cjs', 'tests/phase11/recovery.test.cjs', 'tests/phase11/scale.test.cjs'],
  workspace: ['tests/phase12/files.test.cjs', 'tests/phase12/git.test.cjs', 'tests/phase12/discovery.test.cjs', 'tests/phase12/api.test.cjs'],
  backup: ['tests/phase14/barrier.test.cjs', 'tests/phase14/portable.test.cjs', 'tests/phase14/production.test.cjs', 'tests/phase14/sqlite.test.cjs'],
  observability: ['tests/phase13/scale.test.cjs', 'tests/phase13/security.test.cjs', 'tests/phase13/recovery.test.cjs'],
};
async function qualify() {
  const state = context('qualification');
  const report = { phase: '15', status: 'FAIL', commit: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), run_id: state.run, runner: null, suites: {}, cleanup: 'NOT_RUN', collection: 'NOT_RUN', packaging: 'NOT_RUN' };
  let failure;
  try {
    report.runner = await preflight(state);
    await run(state, 'backend-build', [process.execPath, 'scripts/build-back.cjs']);
    for (const [name, files] of Object.entries(suites)) {
      let error;
      try { await run(state, 'qualification-' + name, [process.execPath, '--test', '--test-concurrency=1', ...files], {}, 1200); }
      catch (caught) { error = caught; }
      const log = path.join(state.output, 'logs', 'qualification-' + name + '.log');
      try {
        const result = tap(fs.readFileSync(log, 'utf8'));
        report.suites[name] = result;
        assert.ok(result.tests > 0 && result.tests === result.pass && result.fail === 0 && result.skipped === 0, 'QUALIFICATION_TESTS_REQUIRED');
      } catch (caught) { error ||= caught; }
      if (error) failure ||= error;
    }
  } catch (error) { failure ||= error; }
  finally {
    state.status = failure ? 'FAIL' : 'PASS';
    report.status = state.status;
    atomic(path.join(state.output, 'tests/qualification.json'), report);
    try { evidence.collect(state); report.collection = 'PASS'; } catch (error) { failure ||= error; report.collection = 'FAIL'; }
    try { await cleanup(state); report.cleanup = 'PASS'; } catch (error) { failure ||= error; report.cleanup = 'FAIL'; }
    // The collection owns the destination. Update only its authenticated result.
    const destination = evidence.artifactDirectory(state);
    if (fs.existsSync(path.join(destination, '.owner')) && fs.readFileSync(path.join(destination, '.owner'), 'utf8') === state.token && report.collection === 'PASS') {
      report.status = failure ? 'FAIL' : 'PASS';
      atomic(path.join(destination, 'tests/qualification.json'), report);
      try {
        evidence.pack(state);
        report.packaging = 'PASS';
        atomic(path.join(destination, 'tests/qualification.json'), report);
        // Repack the final receipt so both standalone evidence and archive agree.
        evidence.pack(state);
      } catch (error) { failure ||= error; report.packaging = 'FAIL'; }
    }
    report.status = failure ? 'FAIL' : 'PASS';
    atomic(path.join(state.output, 'tests/qualification.json'), report);
    if (report.collection === 'PASS') atomic(path.join(destination, 'tests/qualification.json'), report);
    if (failure) throw failure;
  }
  return report;
}
if (require.main === module) qualify().then(report => console.log(JSON.stringify(report))).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { suites, qualify };
