const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const leaseHelper = path.resolve('shell/runtime_lease.py');
const renameHelper = path.resolve('shell/workspace_rename.py');
function root(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'phase15-native-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function probe(file) {
  const fd = fs.openSync(file, 'a+');
  try { return spawnSync('/usr/bin/python3', ['-I', '-S', leaseHelper], { stdio: ['ignore', 'pipe', 'pipe', fd] }).status; }
  finally { fs.closeSync(fd); }
}
async function until(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'native handshake timed out'); await new Promise(r => setTimeout(r, 10)); }
}
test('FD flock survives parent exit and only the last grandchild owner releases it', async t => {
  const directory = root(t), lock = path.join(directory, 'lease'), fd = fs.openSync(lock, 'a+');
  assert.equal(spawnSync('/usr/bin/python3', ['-I', '-S', leaseHelper], { stdio: ['ignore', 'pipe', 'pipe', fd] }).status, 0);
  assert.equal(probe(lock), 75);
  const parent = spawn(process.execPath, [path.resolve('tests/phase15/lease-tree-worker.cjs'), 'parent', directory], { stdio: ['ignore', 'pipe', 'pipe', fd] });
  const exit = once(parent, 'exit');
  fs.closeSync(fd);
  try {
    assert.deepEqual(await exit, [0, null]);
    assert.ok(fs.existsSync(path.join(directory, 'ready')));
    assert.equal(probe(lock), 75, 'orphaned grandchild must retain the open-file-description lease');
  } finally {
    fs.writeFileSync(path.join(directory, 'release'), '');
    await until(() => fs.existsSync(path.join(directory, 'released')));
  }
  assert.equal(probe(lock), 0);
});
test('fixed no-replace helper supports literal names, symlink and directory conflicts, and two-process race', async t => {
  const directory = root(t);
  const rename = (source, target) => new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/python3', ['-I', '-S', renameHelper, path.join(directory, source), path.join(directory, target)]);
    child.on('error', reject); child.on('exit', (code, signal) => signal ? reject(Error(signal)) : resolve(code));
  });
  for (const name of ['--leading', '中文', 'space quote\'";$()']) {
    fs.writeFileSync(path.join(directory, name), 'original');
    assert.equal(await rename(name, name + '.moved'), 0);
    assert.equal(fs.readFileSync(path.join(directory, name + '.moved'), 'utf8'), 'original');
  }
  fs.writeFileSync(path.join(directory, 'a'), 'A'); fs.writeFileSync(path.join(directory, 'b'), 'B');
  const race = await Promise.all([rename('a', 'winner'), rename('b', 'winner')]);
  assert.equal(race.filter(code => code === 0).length, 1);
  assert.equal(race.filter(code => code === os.constants.errno.EEXIST).length, 1);
  const loser = race[0] ? 'a' : 'b';
  fs.symlinkSync('winner', path.join(directory, 'link'));
  assert.equal(await rename(loser, 'link'), os.constants.errno.EEXIST);
  assert.ok(fs.lstatSync(path.join(directory, 'link')).isSymbolicLink());
  fs.mkdirSync(path.join(directory, 'folder')); fs.mkdirSync(path.join(directory, 'other'));
  assert.equal(await rename('folder', 'other'), os.constants.errno.EEXIST);
  assert.equal(await rename('folder', 'new-folder'), 0);
  t.diagnostic(JSON.stringify({ platform: process.platform, syscall: process.platform === 'linux' ? 'renameat2(RENAME_NOREPLACE)' : 'renamex_np(RENAME_EXCL)', linux_qualification: process.platform === 'linux' ? 'EXECUTED' : 'NOT_EXECUTED' }));
});
