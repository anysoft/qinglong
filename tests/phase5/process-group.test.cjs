const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const root = path.resolve(__dirname, '../..');
test('POSIX group cleanup accepts only a verified dead Darwin group, never live permission failures', async () => {
  const result = await run('python3', ['-I', '-S', path.join(__dirname, 'process-group-check.py'), path.join(root, 'shell/process_group.py')], { timeout: 15000 });
  assert.match(result.stdout, /PASS/);
  assert.equal(result.stderr, '');
});
