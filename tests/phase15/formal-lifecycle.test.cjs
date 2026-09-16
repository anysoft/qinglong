const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const { fixture, task, wait } = require('../phase10/helpers.cjs');
async function hook(h, id, phase, command, options = {}) {
  return h.TaskHookModel.create({ task_id: id, name: phase, phase, command, cwd_base: 'TASK_CWD', position: 1, timeout_seconds: 5, failure_policy: 'FAIL_EXECUTION', enabled: true, ...options });
}
for (const scenario of [
  { name: 'main failure', main: 'exit 7', primary: 'MAIN', branch: 'AFTER_FAILURE' },
  { name: 'after success failure does not enter failure branch', main: 'echo MAIN_OK', hooks: [['AFTER_SUCCESS', 'exit 9']], primary: 'AFTER_SUCCESS', branch: 'AFTER_SUCCESS' },
  { name: 'finally failure changes success', main: 'echo MAIN_OK', hooks: [['FINALLY', 'exit 11']], primary: 'FINALLY', branch: 'AFTER_SUCCESS' },
  { name: 'finally failure preserves main error', main: 'exit 7', hooks: [['FINALLY', 'exit 11']], primary: 'MAIN', branch: 'AFTER_FAILURE' },
  { name: 'continue before failure permits main', main: 'echo MAIN_OK', hooks: [['BEFORE', 'exit 9', { failure_policy: 'CONTINUE' }]], primary: null, branch: 'AFTER_SUCCESS' },
  { name: 'invalid hook output hides its buffered secret', main: 'echo MUST_NOT_RUN', hooks: [['BEFORE', 'echo UNKNOWN_GENERATED_SECRET; echo invalid > "$PLATFORM_HOOK_OUTPUT"']], primary: 'BEFORE', branch: 'AFTER_FAILURE' },
]) test('formal Task lifecycle: ' + scenario.name, async t => {
  const h = await fixture(t), f = await task(h, scenario.main);
  for (const [phase, command, options] of scenario.hooks || []) await hook(h, f.definition.id, phase, command, options);
  for (const phase of ['AFTER_SUCCESS', 'AFTER_FAILURE', 'FINALLY']) await hook(h, f.definition.id, phase, 'echo VISITED_' + phase, { position: 20 });
  const run = await h.execution.submit(f.definition.id), result = await wait(h, run.id);
  assert.equal(result.status, scenario.primary ? 'FAILED' : 'SUCCESS');
  assert.equal(result.result.primaryError?.phase || null, scenario.primary);
  const log = await h.execution.log(run.id);
  assert.match(log, new RegExp('VISITED_' + scenario.branch));
  assert.doesNotMatch(log, new RegExp('VISITED_' + (scenario.branch === 'AFTER_SUCCESS' ? 'AFTER_FAILURE' : 'AFTER_SUCCESS')));
  assert.match(log, /VISITED_FINALLY/); assert.doesNotMatch(log, /UNKNOWN_GENERATED_SECRET|MUST_NOT_RUN/);
});
test('formal PREPARE conflict starts no user phase and preserves original Config target', async t => {
  const h = await fixture(t), f = await task(h, 'echo MUST_NOT_RUN');
  await fs.writeFile(path.join(f.root, 'config.txt'), 'ORIGINAL');
  const asset = await new (h.load('back/services/configAsset.ts').default)().save({ name: 'conflict', is_secret: false, content: 'INJECTED' });
  await new (h.load('back/services/taskConfig.ts').default)().save('task', f.definition.id, { asset_id: asset.id, operation: 'ATTACH', target_base: 'WORKSPACE_ROOT', target_path: 'config.txt', materialization_mode: 'COPY', conflict_policy: 'FAIL_IF_EXISTS', writable: false, enabled: true });
  for (const phase of ['BEFORE', 'AFTER_FAILURE', 'FINALLY']) await hook(h, f.definition.id, phase, 'echo MUST_NOT_RUN');
  const run = await h.execution.submit(f.definition.id), result = await wait(h, run.id);
  assert.equal(result.status, 'FAILED'); assert.equal(result.result.primaryError.phase, 'PREPARE');
  assert.doesNotMatch(await h.execution.log(run.id), /MUST_NOT_RUN/);
  assert.equal(await fs.readFile(path.join(f.root, 'config.txt'), 'utf8'), 'ORIGINAL');
});
test('formal BEFORE timeout kills descendants and still executes failure/finally', async t => {
  const h = await fixture(t), f = await task(h, 'echo MUST_NOT_RUN');
  await hook(h, f.definition.id, 'BEFORE', 'sleep 20 & echo $! > descendant.pid; wait', { timeout_seconds: 1 });
  await hook(h, f.definition.id, 'BEFORE', 'echo MUST_NOT_RUN', { position: 20 });
  await hook(h, f.definition.id, 'AFTER_FAILURE', 'echo FAILURE_OK'); await hook(h, f.definition.id, 'FINALLY', 'echo FINALLY_OK');
  const run = await h.execution.submit(f.definition.id), result = await wait(h, run.id);
  assert.equal(result.status, 'TIMEOUT'); const log = await h.execution.log(run.id);
  assert.match(log, /FAILURE_OK/); assert.match(log, /FINALLY_OK/); assert.doesNotMatch(log, /MUST_NOT_RUN/);
  const pid = Number(await fs.readFile(path.join(f.root, 'descendant.pid'), 'utf8'));
  let state = '';
  try { state = require('node:child_process').execFileSync('ps', ['-p', String(pid), '-o', 'stat='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  assert.ok(!state || state.startsWith('Z'), 'Hook descendant remains alive');
});
