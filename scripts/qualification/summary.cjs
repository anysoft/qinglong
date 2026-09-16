const fs = require('node:fs'), path = require('node:path');
const { atomic } = require('../ci/context.cjs');
function find(root, basename) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw Error('UNSAFE_ARTIFACT_PATH');
    return entry.isDirectory() ? find(file, basename) : entry.name === basename ? [file] : [];
  });
}
function single(root, basename) {
  const files = find(root, basename);
  if (files.length !== 1) throw Error('MISSING_OR_AMBIGUOUS_' + basename);
  return JSON.parse(fs.readFileSync(files[0], 'utf8'));
}
function summary() {
  const needs = JSON.parse(process.env.CI_NEEDS || '{}');
  const result = { phase: '15', status: 'FAIL', commit: process.env.CI_COMMIT || null, run_id: process.env.CI_RUN_ID || null, needs, errors: [] };
  const requireGate = (condition, message) => { if (!condition) result.errors.push(message); };
  try {
    requireGate(process.env.CI_DOWNLOAD_OUTCOME === 'success', 'ARTIFACT_DOWNLOAD_FAILED');
    for (const job of ['foundation', 'qualification']) requireGate(needs[job]?.result === 'success', job + '_NOT_SUCCESS');
    requireGate(needs.qualification?.outputs?.upload === 'success', 'QUALIFICATION_UPLOAD_FAILED');
    result.foundation = single('qualification-downloaded', 'final-summary.json');
    result.qualification = single('qualification-downloaded', 'qualification.json');
    requireGate(result.foundation.status === 'PASS', 'FOUNDATION_FAILED');
    for (const job of ['preflight', 'core', 'managed-runtime', 'browser']) {
      requireGate(result.foundation.jobs?.[job]?.status === 'PASS', 'FOUNDATION_' + job + '_NOT_PASS');
      requireGate(result.foundation.jobs?.[job]?.artifact === 'success', 'FOUNDATION_' + job + '_ARTIFACT');
    }
    const validCounts = value => Number.isSafeInteger(value?.tests) && value.tests > 0 &&
      value.pass === value.tests && value.fail === 0 && value.skipped === 0;
    requireGate(validCounts(result.foundation.tests), 'FOUNDATION_TEST_COUNTS');
    requireGate(result.qualification.runner?.status === 'PASS' && result.qualification.runner.os === 'Linux' &&
      result.qualification.runner.osVersion === '24.04' && result.qualification.runner.arch === 'x64', 'QUALIFICATION_PLATFORM');
    for (const name of ['native','execution','triggers','workspace','backup','observability']) {
      requireGate(validCounts(result.qualification.suites?.[name]), 'QUALIFICATION_SUITE_' + name);
    }
    requireGate(result.qualification.run_id === process.env.CI_QUALIFICATION_RUN_ID, 'QUALIFICATION_RUN_MISMATCH');
    requireGate(result.foundation.commit === result.commit, 'FOUNDATION_SHA_MISMATCH');
    requireGate(result.qualification.commit === result.commit, 'QUALIFICATION_SHA_MISMATCH');
    const types = result.foundation.typecheck;
    requireGate(types?.errors === 0 && types?.raw_failed === false && types?.status === 'PASS', 'RAW_TYPECHECK_NOT_ZERO');
    for (const gate of ['status', 'cleanup', 'collection', 'packaging']) requireGate(result.qualification[gate] === 'PASS', 'QUALIFICATION_' + gate.toUpperCase());
    result.bridges = JSON.parse(fs.readFileSync('diagnostics/phase15/bridge-audit.json', 'utf8'));
    requireGate(result.bridges.temporaryRemaining === 0 && result.bridges.entries?.length === 17 &&
      Array.from({length:17}, (_,i) => 'B' + String(i+1).padStart(2,'0')).every(id =>
        result.bridges.entries.filter(entry => entry.id === id && entry.complete === true &&
          ['REMOVE_PHYSICALLY','FORMALIZE_AS_REAL_INTERNAL_COMPONENT'].includes(entry.decision)).length === 1), 'BRIDGE_FINALIZATION_INCOMPLETE');
    for (const file of ['shell/task.sh', 'shell/otask.sh', 'back/taskExecution.ts', 'back/api/script.ts', 'back/api/cron.ts']) requireGate(!fs.existsSync(file), 'LEGACY_SOURCE_REMAINS:' + file);
  } catch (error) { result.errors.push(error.message); }
  if (process.env.CI_FINAL_UPLOAD === 'failure') result.errors.push('FINAL_ARTIFACT_UPLOAD_FAILED');
  result.status = result.errors.length ? 'FAIL' : 'PASS';
  atomic('diagnostics/phase15/hosted-final-gates.json', result);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Phase 15 qualification: ${result.status}\n\nCommit: ${result.commit}\n\n${result.errors.map(error => '- ' + error).join('\n')}\n`);
  return result;
}
if (require.main === module) process.exitCode = summary().status === 'PASS' ? 0 : 1;
module.exports = { summary };
