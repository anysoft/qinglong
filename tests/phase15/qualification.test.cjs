const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const yaml = require('js-yaml');
const { summary } = require('../../scripts/qualification/summary.cjs');
test('qualification workflow composes full foundation with read-only fixed Ubuntu gates', () => {
  const text = fs.readFileSync('.github/workflows/linux-qualification.yml', 'utf8'), workflow = yaml.load(text);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.foundation.uses, './.github/workflows/linux-ci.yml');
  assert.equal(workflow.jobs.foundation.with.scope, 'full');
  assert.deepEqual(workflow.jobs['qualification-summary'].needs, ['foundation', 'qualification']);
  assert.equal(workflow.jobs['qualification-summary'].if, 'always()');
  assert.doesNotMatch(text, /secrets\.|contents:\s*write|packages:\s*write|id-token:\s*write|ubuntu-latest|self-hosted|pull_request_target/);
  for (const job of Object.values(workflow.jobs).filter(job => job.steps)) {
    assert.equal(job['runs-on'], 'ubuntu-24.04');
    for (const step of job.steps) {
      if (step.run) assert.doesNotMatch(step.run, /\$\{\{/);
      if (step.uses?.startsWith('actions/upload-artifact')) { assert.equal(step.if, 'always()'); assert.equal(step.with['if-no-files-found'], 'error'); }
    }
  }
});
test('qualification summary fails closed for missing evidence, SHA mismatch, bridges and upload failure', () => {
  const original = process.cwd(), root = fs.mkdtempSync(path.join(os.tmpdir(), 'qualification-summary-'));
  const names = ['CI_NEEDS', 'CI_COMMIT', 'CI_DOWNLOAD_OUTCOME', 'GITHUB_STEP_SUMMARY', 'CI_QUALIFICATION_RUN_ID', 'CI_FINAL_UPLOAD'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  try {
    process.chdir(root); delete process.env.GITHUB_STEP_SUMMARY;
    process.env.CI_QUALIFICATION_RUN_ID = 'fixture-run'; delete process.env.CI_FINAL_UPLOAD;
    process.env.CI_COMMIT = 'fixture-sha'; process.env.CI_DOWNLOAD_OUTCOME = 'success';
    const needs = { foundation: { result: 'success' }, qualification: { result: 'success', outputs: { upload: 'success' } } };
    process.env.CI_NEEDS = JSON.stringify(needs);
    assert.equal(summary().status, 'FAIL');
    write('qualification-downloaded/foundation/final-summary.json', { status: 'PASS', commit: 'fixture-sha', jobs: Object.fromEntries(['preflight','core','managed-runtime','browser'].map(x=>[x,{status:'PASS',artifact:'success'}])), tests:{tests:1,pass:1,fail:0,skipped:0}, typecheck: { status: 'PASS', errors: 0, raw_failed: false } });
    const native = { run_id:'fixture-run', runner:{status:'PASS',os:'Linux',osVersion:'24.04',arch:'x64'}, suites:Object.fromEntries(['native','execution','triggers','workspace','backup','observability'].map(x=>[x,{tests:1,pass:1,fail:0,skipped:0}])), status: 'PASS', commit: 'fixture-sha', collection: 'PASS', cleanup: 'PASS', packaging: 'PASS' };
    for (let round = 1; round <= 10; round++) native.suites['socket-' + round] = {tests:1,pass:1,fail:0,skipped:0};
    write('qualification-downloaded/native/qualification.json', native);
    const bridges = { temporaryRemaining:0, entries: Array.from({ length: 17 }, (_, i) => ({ id: 'B' + String(i + 1).padStart(2,'0'), complete: true, decision:'REMOVE_PHYSICALLY' })) };
    write('diagnostics/phase15/bridge-audit.json', bridges);
    assert.equal(summary().status, 'PASS');
    for (const patch of [{run_id:'old-run'}, {runner:{...native.runner,os:'Darwin'}}, {suites:{...native.suites,native:{tests:1,pass:1,fail:0,skipped:1}}}, {suites:{}}]) {
      write('qualification-downloaded/native/qualification.json',{...native,...patch}); assert.equal(summary().status,'FAIL');
    }
    write('qualification-downloaded/native/qualification.json',native);
    for (let round = 1; round <= 10; round++) {
      const suites = {...native.suites}; delete suites['socket-' + round];
      write('qualification-downloaded/native/qualification.json', {...native, suites});
      assert.equal(summary().status, 'FAIL');
    }
    write('qualification-downloaded/native/qualification.json', native);
    process.env.CI_FINAL_UPLOAD='failure';assert.equal(summary().status,'FAIL');delete process.env.CI_FINAL_UPLOAD;
    bridges.entries[0].complete = false; write('diagnostics/phase15/bridge-audit.json', bridges);
    assert.equal(summary().status, 'FAIL');
    bridges.entries[0].complete = true; write('diagnostics/phase15/bridge-audit.json', bridges);
    write('qualification-downloaded/native/qualification.json', { ...native, commit: 'old-sha' });
    assert.equal(summary().status, 'FAIL');
    write('qualification-downloaded/native/qualification.json', native);
    needs.qualification.outputs.upload = 'failure'; process.env.CI_NEEDS = JSON.stringify(needs);
    assert.equal(summary().status, 'FAIL');
    needs.qualification.outputs.upload = 'success'; process.env.CI_NEEDS = JSON.stringify(needs);
    fs.mkdirSync('shell'); fs.writeFileSync('shell/task.sh', '');
    assert.equal(summary().status, 'FAIL');
  } finally {
    process.chdir(original); fs.rmSync(root, { recursive: true, force: true });
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});
