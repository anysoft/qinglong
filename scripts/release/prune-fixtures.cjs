'use strict';
// Only build-owned dependency test data; preserve code, license and notices.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('node_modules');
const removed = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    if (!entry.isDirectory()) continue; // Never follow package symlinks.
    const child = path.join(directory, entry.name);
    if (['test', 'tests', '__tests__', 'fixtures'].includes(entry.name)) {
      removed.push(path.relative(root, child));
      fs.rmSync(child, {recursive:true});
    } else visit(child);
  }
}
visit(root);
console.log(JSON.stringify({dependency_fixture_directories_removed:removed}));
