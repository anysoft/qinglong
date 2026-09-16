#!/usr/bin/env node
'use strict';
// Foreground platform entrypoint. OS packages and process supervision belong to the operator.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const data = process.env.QL_DATA_DIR;
if (!data || !path.isAbsolute(data) || path.resolve(data) === path.parse(data).root) {
  console.error('QL_DATA_DIR must be an absolute, dedicated data directory.');
  process.exit(64);
}
const app = path.join(root, 'static/build/app.js');
if (!fs.existsSync(app) || !fs.existsSync(path.join(root, '.env'))) {
  console.error('Prepare .env and build the backend before starting the platform.');
  process.exit(78);
}
const child = spawn(process.execPath, [app], {
  cwd: root, stdio: 'inherit', env: { ...process.env, QL_DIR: root, QL_DATA_DIR: path.resolve(data) },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('PLATFORM_START_FAILED'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143); });
