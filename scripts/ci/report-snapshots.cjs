// Legacy acceptance tests write tracked reports. Journal only their exact paths
// so interrupted runs can restore the checkout before deleting private state.
const fs = require('node:fs'),
  path = require('node:path');
const { atomic, repository, owned } = require('./context.cjs');
const allowed = new Set([
  'diagnostics/phase7/offline-result.json',
  'diagnostics/phase8/offline-result.json',
  'diagnostics/phase8/lifecycle-result.json',
  'diagnostics/phase10/managed-python-execution.json',
  'diagnostics/phase10/managed-node-execution.json',
]);
function restore(root) {
  const file = path.join(root, 'report-snapshot.json');
  if (!fs.existsSync(file)) return;
  const rows = JSON.parse(fs.readFileSync(file));
  for (const [name, encoded] of rows) {
    if (!allowed.has(name)) throw Error('INVALID_REPORT_SNAPSHOT');
    const target = path.join(repository, name);
    if (encoded === null) fs.rmSync(target, { force: true });
    else fs.writeFileSync(target, Buffer.from(encoded, 'base64'));
  }
  fs.unlinkSync(file);
}
function save(root, reports) {
  restore(root);
  const rows = reports.map((name) => {
    if (!allowed.has(name)) throw Error('INVALID_REPORT_PATH');
    const file = path.join(repository, name);
    return [
      name,
      fs.existsSync(file) ? fs.readFileSync(file).toString('base64') : null,
    ];
  });
  atomic(path.join(root, 'report-snapshot.json'), rows);
}
function recover(s) {
  owned(s);
  restore(s.root);
}
module.exports = { save, restore, recover };
