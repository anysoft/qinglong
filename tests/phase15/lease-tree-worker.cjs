const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const [mode, root] = process.argv.slice(2);
if (mode === 'parent') {
  const child = spawn(process.execPath, [__filename, 'grandchild', root], { stdio: ['ignore', 'ignore', 'ignore', 3] });
  child.unref();
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(root, 'ready'))) { clearInterval(timer); process.exit(0); }
  }, 10);
  setTimeout(() => process.exit(2), 15000).unref();
} else {
  fs.writeFileSync(path.join(root, 'ready'), String(process.pid));
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(root, 'release'))) {
      fs.closeSync(3);
      clearInterval(timer);
      fs.writeFileSync(path.join(root, 'released'), '');
    }
  }, 10);
  setTimeout(() => process.exit(2), 15000).unref();
}
