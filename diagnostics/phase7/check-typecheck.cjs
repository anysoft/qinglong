// Keep the original diagnostic budget visible; fail on any new/increased error.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const baseline = require('./typecheck-baseline.json');
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'),
  '--noEmit', '--skipLibCheck', '--pretty', 'false'], { cwd: root, encoding: 'utf8' });
if (result.error) throw result.error;
const output = (result.stdout || '') + (result.stderr || '');
fs.writeFileSync(path.join(__dirname, 'final-typecheck.log'), output);
const current = {};
for (const line of output.split('\n')) {
  if (!/^.+\(\d+,\d+\): error TS\d+:/.test(line)) continue;
  const key = line.replace(/\(\d+,\d+\):/, ':').trim();
  current[key] = (current[key] || 0) + 1;
}
const added = Object.entries(current).filter(([key, count]) => count > (baseline.diagnostics[key] || 0));
const remaining = Object.values(current).reduce((sum, count) => sum + count, 0);
const unexpectedFailure = result.signal || (result.status !== 0 && remaining === 0);
const report = { status: added.length || unexpectedFailure ? 'FAIL' : remaining ? 'PARTIAL' : 'PASS',
  original: baseline.original_count, remaining, new: added, raw_exit_code: result.status,
  regression_gate: added.length || unexpectedFailure ? 'FAIL' : 'PASS' };
fs.writeFileSync(path.join(__dirname, 'final-typecheck.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (added.length || unexpectedFailure) process.exitCode = 1;
