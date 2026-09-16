const path = require('node:path');
const destination = process.env.QL_MANAGED_DIR;
// Crash workers intentionally receive only PATH and their fixture root argv.
// They inherit execArgv, but do not read the historical manifest modules.
if (destination) {
  for (const [phase, kind] of [
    ['phase8', 'managed-node'],
    ['phase10', 'managed-node'],
    ['phase10', 'managed-runtime'],
  ]) {
    const file = path.resolve(
      __dirname,
      '../../diagnostics',
      phase,
      kind,
      'result.json',
    );
    require.cache[file] = {
      id: file,
      filename: file,
      loaded: true,
      exports: require(path.join(destination, kind, 'result.json')),
    };
  }
  process.env.QL_PHASE7_MANAGED_ROOT = require(path.join(
    destination,
    'managed-runtime/result.json',
  )).root;
}
