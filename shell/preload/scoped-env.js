const fs = require('fs');
const path = require('path');
const directory = process.env.QL_TASK_ENV_SNAPSHOT;
const snapshot = directory ? JSON.parse(fs.readFileSync(path.join(directory, 'snapshot.json'), 'utf8')) : null;
exports.directory = directory;
exports.apply = function applyScopedEnvironment() {
  if (!snapshot) return;
  for (const name of snapshot.unset) delete process.env[name];
  for (const [name, value] of Object.entries(snapshot.variables)) process.env[name] = value;
};
