const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { execFileSync } = require('node:child_process');
const load = require('../../test/helpers/load-security-module.cjs');
const { WorkspaceFiles, workspaceRelative, EDIT_LIMIT, VIEW_LIMIT } = load(
  path.resolve('back/services/workspaceFiles.ts'),
  { '../config': { rootPath: process.cwd() } },
);
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace12-files-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, f: new WorkspaceFiles(root) };
}
const rejects = (fn, code) => assert.rejects(fn, (e) => e.error_code === code);
test('workspace rejects traversal, Windows/control paths, .git and reserved execution artifacts', async (t) => {
  const { f } = await fixture(t);
  for (const p of [
    '/tmp/a',
    'C:/a',
    '\\\\host\\a',
    '.',
    '..',
    'a/../b',
    'a//b',
    'a\\b',
    'a\0b',
    'a\nb',
    '.git/config',
    'a/.GiT/x',
    '.platform-run-abc',
  ])
    assert.throws(() => workspaceRelative(p));
  await f.create('tmp', '', true);
  await f.create('tmp/ok', 'ok');
  assert.equal((await f.read('tmp/ok')).content, 'ok');
});
test('UTF8 BOM CRLF empty executable and literal unusual filenames survive atomic saves', async (t) => {
  const { f, root } = await fixture(t);
  for (const p of [
    'a b',
    'a;b',
    '$(x)',
    '--evil',
    '中文.py',
    'percent%quote\'"',
  ]) {
    await fs.writeFile(path.join(root, p), '\uFEFFfirst\r\n', { mode: 0o751 });
    const before = await f.read(p);
    assert.equal(before.bom, true);
    const after = await f.save(p, '下一行\n', before.hash);
    assert.equal(after.mode, 0o751);
    assert.equal(
      await fs.readFile(path.join(root, p), 'utf8'),
      '\uFEFF下一行\r\n',
    );
  }
  const empty = await f.create('empty.sh', '');
  assert.equal(empty.mode, 0o644);
  assert.equal(empty.content, '');
});
test('external changes conflict; stale delete/rename and existing destinations preserve originals', async (t) => {
  const { f, root } = await fixture(t);
  const old = await f.create('a', 'original');
  execFileSync(process.execPath, [
    '-e',
    'require("fs").writeFileSync(process.argv[1],"external")',
    path.join(root, 'a'),
  ]);
  await rejects(
    () => f.save('a', 'overwrite', old.hash),
    'WORKSPACE_FILE_CONFLICT',
  );
  await rejects(() => f.remove('a', old.hash), 'WORKSPACE_FILE_CONFLICT');
  await rejects(() => f.rename('a', 'b', old.hash), 'WORKSPACE_FILE_CONFLICT');
  const now = await f.read('a');
  await f.create('b', 'destination');
  await rejects(
    () => f.rename('a', 'b', now.hash),
    'WORKSPACE_DESTINATION_EXISTS',
  );
  assert.equal((await f.read('a')).content, 'external');
  assert.equal((await f.read('b')).content, 'destination');
  await rejects(() => f.create('b', 'bad'), 'WORKSPACE_DESTINATION_EXISTS');
});
test('file and directory rename never overwrite; delete directories only when empty', async (t) => {
  const { f } = await fixture(t);
  const a = await f.create('a', 'x');
  await f.rename('a', 'b', a.hash);
  await f.remove('b', a.hash);
  const d = await f.create('folder', '', true);
  await f.rename('folder', 'other', d.identity);
  await f.create('other/child', 'x');
  const meta = await f.metadata('other');
  await rejects(
    () => f.remove('other', meta.identity),
    'WORKSPACE_DIRECTORY_NOT_EMPTY',
  );
  await f.remove('other/child', (await f.read('other/child')).hash);
  await f.remove('other', (await f.metadata('other')).identity);
});
test('symlinks are metadata only, external link hides target; FIFO/hardlink rejected', async (t) => {
  const { f, root } = await fixture(t);
  await f.create('safe', 'secret');
  await fs.symlink('safe', path.join(root, 'link'));
  await fs.symlink('/etc/passwd', path.join(root, 'external'));
  assert.equal((await f.read('link')).editable, false);
  assert.equal((await f.read('external')).error_code, 'UNSAFE_SYMLINK');
  assert.equal((await f.read('external')).link, undefined);
  await rejects(
    () => f.save('link', 'bad', 'a'.repeat(64)),
    'WORKSPACE_PATH_FORBIDDEN',
  );
  await rejects(() => f.read('link/x'), 'WORKSPACE_PATH_FORBIDDEN');
  await fs.link(path.join(root, 'safe'), path.join(root, 'hard'));
  await rejects(() => f.read('hard'), 'WORKSPACE_PATH_FORBIDDEN');
  execFileSync('mkfifo', [path.join(root, 'fifo')]);
  await rejects(() => f.read('fifo'), 'WORKSPACE_SPECIAL_FILE');
});
test('binary invalid UTF8 and file size boundaries are explicit', async (t) => {
  const { f, root } = await fixture(t);
  for (const [p, b] of [
    ['nul', Buffer.from([65, 0, 66])],
    ['invalid', Buffer.from([255, 254])],
  ]) {
    await fs.writeFile(path.join(root, p), b);
    const read = await f.read(p);
    assert.equal(read.binary, true);
    await rejects(
      () => f.save(p, 'text', read.hash),
      'WORKSPACE_BINARY_NOT_EDITABLE',
    );
  }
  await fs.writeFile(path.join(root, 'large'), 'x'.repeat(EDIT_LIMIT + 1));
  assert.equal((await f.read('large')).editable, false);
  await fs.writeFile(path.join(root, 'huge'), 'x'.repeat(VIEW_LIMIT + 1));
  assert.equal((await f.read('huge')).error_code, 'WORKSPACE_FILE_TOO_LARGE');
});
test('failed atomic publish leaves original and cleans only owned temporary', async (t) => {
  const { f, root } = await fixture(t);
  const old = await f.create('a', 'original'),
    rename = fs.rename;
  fs.rename = async () => {
    throw Object.assign(new Error('fixture disk failure'), { code: 'ENOSPC' });
  };
  try {
    await assert.rejects(() => f.save('a', 'new', old.hash));
  } finally {
    fs.rename = rename;
  }
  assert.equal((await f.read('a')).content, 'original');
  assert.deepEqual(await fs.readdir(root), ['a']);
});
test('20k files lazy pagination and 10k-file content search stay bounded', async (t) => {
  const { f, root } = await fixture(t);
  const start = Date.now();
  for (let start = 0; start < 20000; start += 200)
    await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        fs.writeFile(
          path.join(root, `file-${String(start + i).padStart(5, '0')}`),
          start < 10000 ? 'needle\n' : 'haystack\n',
        ),
      ),
    );
  const tree = await f.tree('', 0, 1000);
  assert.equal(tree.total, 20000);
  assert.equal(tree.items.length, 1000);
  assert.equal(tree.next, 1000);
  const search = await f.search('needle', true);
  assert.ok(search.items.length <= 200);
  assert.ok(search.scanned <= 10001);
  assert.equal(search.truncated, true);
  console.log(
    JSON.stringify({
      phase12: 'filesystem-scale',
      files: 20000,
      elapsed_ms: Date.now() - start,
      rss: process.memoryUsage().rss,
      search: {
        count: search.items.length,
        scanned: search.scanned,
        truncated: search.truncated,
      },
    }),
  );
});
test('disk write and post-publish directory fsync failures preserve the original bytes and mode', async (t) => {
  const { f, root } = await fixture(t),
    old = await f.create('original', 'before\n');
  await fs.chmod(path.join(root, 'original'), 0o751);
  const open = fs.open;
  fs.open = async (...args) => {
    const fd = await open(...args);
    if (
      String(args[0]).includes('.platform-workspace-') &&
      !String(args[0]).endsWith('.rollback')
    )
      fd.writeFile = async () => {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      };
    return fd;
  };
  try {
    await assert.rejects(() => f.save('original', 'after\n', old.hash), {
      code: 'ENOSPC',
    });
  } finally {
    fs.open = open;
  }
  assert.equal((await f.read('original')).content, 'before\n');
  let failed = false;
  fs.open = async (...args) => {
    const fd = await open(...args);
    if (args[0] === root && !failed) {
      failed = true;
      fd.sync = async () => {
        throw Object.assign(new Error('directory sync failure'), {
          code: 'EIO',
        });
      };
    }
    return fd;
  };
  try {
    await assert.rejects(() => f.save('original', 'after\n', old.hash), {
      code: 'EIO',
    });
  } finally {
    fs.open = open;
  }
  assert.equal((await f.read('original')).content, 'before\n');
  assert.equal((await f.read('original')).mode, 0o751);
  assert.deepEqual(await fs.readdir(root), ['original']);
});
