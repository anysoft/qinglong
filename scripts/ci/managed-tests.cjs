// Preserve historical checked-in reports, including failure paths.
const fs = require('node:fs'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process');
if (!process.env.QL_MANAGED_DIR) throw Error('QL_MANAGED_DIR required');
const execution = process.argv[2] === 'execution';
const reports = execution
  ? [
      'diagnostics/phase10/managed-python-execution.json',
      'diagnostics/phase10/managed-node-execution.json',
    ]
  : [
      'diagnostics/phase7/offline-result.json',
      'diagnostics/phase8/offline-result.json',
      'diagnostics/phase8/lifecycle-result.json',
    ];
const tests = execution
  ? [
      'tests/phase10/managed-python.test.cjs',
      'tests/phase10/managed-node.test.cjs',
    ]
  : [
      'tests/phase7/offline.test.cjs',
      'tests/phase8/lifecycle.test.cjs',
      'tests/phase8/offline.test.cjs',
    ];
const snapshots = require('./report-snapshots.cjs');
const privateRoot = path.dirname(process.env.QL_ACCEPTANCE_CANARIES);
snapshots.save(privateRoot, reports);
try {
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      path.join(__dirname, 'managed-preload.cjs'),
      '--test',
      '--test-concurrency=1',
      '--test-timeout=600000',
      ...tests,
    ],
    { stdio: 'inherit' },
  );
  for (const file of reports)
    if (fs.existsSync(file))
      fs.copyFileSync(
        file,
        path.join(
          process.env.QL_MANAGED_DIR,
          path.basename(path.dirname(file)) + '-' + path.basename(file),
        ),
      );
  process.exitCode = result.status ?? 1;
} finally {
  snapshots.restore(privateRoot);
}
