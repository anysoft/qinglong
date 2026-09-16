const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const load = require('../../test/helpers/load-security-module.cjs');
const HookExecutor = load(path.resolve('back/services/hookExecutor.ts'), { '../config': { rootPath: process.cwd() } }).default;
test('production supervisor passes only explicit lease descriptors across Node, Python and Shell exec', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase15-fd-exec-'));
  const lease = path.join(root, 'lease'), secret = path.join(root, 'private');
  fs.writeFileSync(lease, 'lease'); fs.writeFileSync(secret, 'private');
  const allowed = fs.openSync(lease, 'r'), forbidden = fs.openSync(secret, 'r');
  t.after(() => { fs.closeSync(allowed); fs.closeSync(forbidden); fs.rmSync(root, { recursive: true, force: true }); });
  const inode = fs.fstatSync(forbidden).ino;
  const python = `import os\nassert os.fstat(3).st_ino == ${fs.fstatSync(allowed).ino}\nfor fd in range(3,256):\n try: s=os.fstat(fd)\n except OSError: continue\n assert s.st_ino != ${inode}\nassert 'PLATFORM_PROCESS_RESULT_FD' not in os.environ\nprint('fd-ok')\n`;
  const pyFile = path.join(root, 'probe.py'); fs.writeFileSync(pyFile, python);
  const node = `const fs=require('fs'),assert=require('assert/strict');assert.equal(fs.fstatSync(3).ino,${fs.fstatSync(allowed).ino});for(let fd=3;fd<256;fd++){let st;try{st=fs.fstatSync(fd)}catch{continue}assert.notEqual(st.ino,${inode});}assert.equal(process.env.PLATFORM_PROCESS_RESULT_FD,undefined);console.log('fd-ok');`;
  const cases = [[process.execPath, ['-e', node]], ['/usr/bin/python3', ['-I', '-S', pyFile]], ['/bin/sh', ['-c', 'test -r /dev/fd/3 && exec /usr/bin/python3 -I -S "$1"', 'fd-probe', pyFile]]];
  for (const [program, args] of cases) {
    let output = '';
    const result = await new HookExecutor([allowed]).run(program, args, root, { PATH: '/usr/bin:/bin' }, 10, async text => { output += text; });
    assert.equal(result.code, 0, output); assert.equal(output, 'fd-ok\n');
  }
});
