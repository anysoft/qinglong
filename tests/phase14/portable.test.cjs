const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
process.env.TS_NODE_PROJECT = path.resolve('back/tsconfig.json');
require('ts-node/register/transpile-only');
const {
  encryptPortable,
  decryptPortable,
} = require('../../back/services/backup/envelope.ts');
const {
  packArchive,
  unpackArchive,
  validateLink,
} = require('../../back/services/backup/archive.ts');
const {
  relativeName,
  privateDirectory,
} = require('../../back/services/backup/files.ts');
async function fixture(t) {
  const root = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), 'phase14-portable-'),
  );
  await fs.chmod(root, 0o700);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function directory(root, name) {
  const result = path.join(root, name);
  await fs.mkdir(result, { mode: 0o700 });
  return result;
}
async function framed(root, metadata, extra = Buffer.alloc(0)) {
  const json = Buffer.from(JSON.stringify(metadata)),
    size = Buffer.alloc(4);
  size.writeUInt32BE(json.length);
  const filename = path.join(root, 'bad-' + Math.random());
  await fs.writeFile(
    filename,
    Buffer.concat([
      Buffer.from('PLATARC1'),
      size,
      json,
      extra,
      Buffer.alloc(4),
    ]),
    { mode: 0o600 },
  );
  return filename;
}
test('portable archive roundtrip preserves secret bytes and safe links inside authenticated envelope', async (t) => {
  const root = await fixture(t),
    source = await directory(root, 'source');
  await directory(source, 'folder');
  const secret = 'fixture-private-secret-中文';
  await fs.writeFile(path.join(source, 'folder', 'data'), secret, {
    mode: 0o600,
  });
  await fs.symlink('folder/data', path.join(source, 'link'));
  const archive = path.join(root, 'archive'),
    encrypted = path.join(root, 'export.platform-backup'),
    clear = path.join(root, 'authenticated');
  const packed = await packArchive(source, archive);
  assert.equal(packed.entries, 3);
  const password = Buffer.from('fixture-password');
  await encryptPortable(archive, encrypted, password);
  const bytes = await fs.readFile(encrypted);
  assert.equal(bytes.includes(Buffer.from(secret)), false);
  assert.equal(bytes.includes(password), false);
  await decryptPortable(encrypted, clear, password);
  password.fill(0);
  const destination = await directory(root, 'candidate');
  assert.deepEqual(await unpackArchive(clear, destination), packed);
  assert.equal(
    await fs.readFile(path.join(destination, 'link'), 'utf8'),
    secret,
  );
  assert.equal(
    (await fs.stat(path.join(destination, 'folder', 'data'))).mode & 0o777,
    0o600,
  );
});
test('wrong passphrase, ciphertext/header/tag tamper, truncation and trailing data fail closed', async (t) => {
  const root = await fixture(t),
    source = path.join(root, 'input'),
    encrypted = path.join(root, 'encrypted');
  await fs.writeFile(source, 'secret database', { mode: 0o600 });
  const pass = Buffer.from('valid passphrase');
  await encryptPortable(source, encrypted, pass);
  const original = await fs.readFile(encrypted);
  const cases = [
    ['wrong', original, Buffer.from('wrong')],
    ['cipher', Buffer.from(original), pass],
    ['header', Buffer.from(original), pass],
    ['tag', Buffer.from(original), pass],
    ['truncated', original.subarray(0, -1), pass],
    ['trailing', Buffer.concat([original, Buffer.from('x')]), pass],
  ];
  cases[1][1][64] ^= 1;
  cases[2][1][24] ^= 1;
  cases[3][1][original.length - 1] ^= 1;
  for (const [name, bytes, password] of cases) {
    const input = path.join(root, name),
      output = path.join(root, name + '-clear');
    await fs.writeFile(input, bytes, { mode: 0o600 });
    await assert.rejects(
      decryptPortable(input, output, password),
      /BACKUP_AUTHENTICATION_FAILED/,
    );
    await assert.rejects(fs.lstat(output), { code: 'ENOENT' });
  }
  assert.deepEqual(await fs.readFile(encrypted), original);
});
test('archive rejects path traversal, drives, links, special entries and bounded sizes', async (t) => {
  const root = await fixture(t);
  for (const name of [
    '../evil',
    '/absolute',
    'C:\\windows',
    'C:/windows',
    'a/../../evil',
    'a\\b',
    'a\0b',
  ])
    assert.throws(() => relativeName(name), /BACKUP_PATH_INVALID/);
  for (const metadata of [
    { path: '../evil', kind: 'file', size: 0, mode: 384 },
    { path: 'link', kind: 'symlink', size: 0, mode: 511, link: '../outside' },
    ...['hardlink', 'fifo', 'socket', 'device'].map((kind) => ({
      path: 'bad',
      kind,
      size: 0,
      mode: 384,
    })),
    { path: 'huge', kind: 'file', size: 101, mode: 384 },
  ]) {
    const input = await framed(root, metadata),
      out = await directory(root, 'out-' + Math.random());
    await assert.rejects(
      unpackArchive(input, out, { entries: 10, bytes: 100, entryBytes: 100 }),
      /BACKUP_/,
    );
  }
  const source = await directory(root, 'many');
  await fs.writeFile(path.join(source, 'one'), '1', { mode: 0o600 });
  await fs.writeFile(path.join(source, 'two'), '2', { mode: 0o600 });
  const archive = path.join(root, 'many.arc');
  await packArchive(source, archive);
  await assert.rejects(
    unpackArchive(archive, await directory(root, 'limited'), {
      entries: 1,
      bytes: 100,
      entryBytes: 100,
    }),
    /BACKUP_LIMIT/,
  );
});
test('symlink followed by parent traversal cannot escape; hardlinked source and symlinked root rejected', async (t) => {
  const root = await fixture(t),
    source = await directory(root, 'source');
  await fs.symlink('.', path.join(source, 'd'));
  await fs.symlink('d/../outside', path.join(source, 'escape'));
  await assert.rejects(
    validateLink(source, 'escape', 'd/../outside'),
    /BACKUP_SOURCE_UNSAFE_SYMLINK/,
  );
  await assert.rejects(
    packArchive(source, path.join(root, 'unsafe.arc')),
    /BACKUP_SOURCE_UNSAFE_SYMLINK/,
  );
  await fs.unlink(path.join(source, 'escape'));
  await fs.unlink(path.join(source, 'd'));
  await fs.writeFile(path.join(source, 'a'), 'value', { mode: 0o600 });
  await fs.link(path.join(source, 'a'), path.join(source, 'b'));
  await assert.rejects(
    packArchive(source, path.join(root, 'hard.arc')),
    /BACKUP_FILE_INVALID/,
  );
  await fs.symlink(source, path.join(root, 'alias'));
  await assert.rejects(
    privateDirectory(path.join(root, 'alias')),
    /BACKUP_PATH_INVALID/,
  );
});
test('extractor never follows an archived symlink parent and never accepts duplicate entries or trailing bytes', async (t) => {
  const root = await fixture(t),
    source = await directory(root, 'source');
  await fs.writeFile(path.join(source, 'data'), 'payload', { mode: 0o600 });
  const archive = path.join(root, 'archive');
  await packArchive(source, archive);
  await fs.appendFile(archive, 'trailing');
  await assert.rejects(
    unpackArchive(archive, await directory(root, 'trailing')),
    /BACKUP_ARCHIVE_TRAILING_DATA/,
  );
  const first = Buffer.from(
      JSON.stringify({
        path: 'alias',
        kind: 'symlink',
        size: 0,
        mode: 511,
        link: '.',
      }),
    ),
    second = Buffer.from(
      JSON.stringify({ path: 'alias/file', kind: 'file', size: 0, mode: 384 }),
    );
  const size = (b) => {
    const n = Buffer.alloc(4);
    n.writeUInt32BE(b.length);
    return n;
  };
  const malicious = path.join(root, 'parents');
  await fs.writeFile(
    malicious,
    Buffer.concat([
      Buffer.from('PLATARC1'),
      size(first),
      first,
      size(second),
      second,
      Buffer.alloc(36),
    ]),
    { mode: 0o600 },
  );
  await assert.rejects(
    unpackArchive(malicious, await directory(root, 'parents-out')),
    /BACKUP_PATH_INVALID/,
  );
});
test('100 MiB data streams through archive and encryption with bounded process memory', async (t) => {
  const root = await fixture(t),
    source = await directory(root, 'scale'),
    file = await fs.open(path.join(source, 'run.log'), 'wx', 0o600);
  await file.truncate(100 * 1024 * 1024);
  await file.close();
  const archive = path.join(root, 'scale.arc'),
    encrypted = path.join(root, 'scale.platform-backup'),
    clear = path.join(root, 'clear.arc'),
    password = Buffer.from('scale-fixture-passphrase');
  const initial = process.memoryUsage().rss;
  let peak = initial;
  const sample = setInterval(
    () => (peak = Math.max(peak, process.memoryUsage().rss)),
    5,
  );
  try {
    await packArchive(source, archive);
    await encryptPortable(archive, encrypted, password);
    await decryptPortable(encrypted, clear, password);
    const dest = await directory(root, 'restored');
    await unpackArchive(clear, dest);
    assert.equal(
      (await fs.stat(path.join(dest, 'run.log'))).size,
      100 * 1024 * 1024,
    );
  } finally {
    clearInterval(sample);
    password.fill(0);
  }
  assert.ok(
    peak - initial < 180 * 1024 * 1024,
    `peak RSS delta ${peak - initial}`,
  );
  t.diagnostic(
    JSON.stringify({
      input_bytes: 100 * 1024 * 1024,
      peak_rss_delta: peak - initial,
    }),
  );
});
test('archive refuses output inside source and preserves a preexisting destination', async (t) => {
  const root = await fixture(t),
    source = await directory(root, 'source');
  await assert.rejects(
    packArchive(source, path.join(source, 'recursive.arc')),
    /BACKUP_DESTINATION_INSIDE_SOURCE/,
  );
  const input = path.join(root, 'input'),
    output = path.join(root, 'existing');
  await fs.writeFile(input, 'plain', { mode: 0o600 });
  await fs.writeFile(output, 'keep', { mode: 0o600 });
  await assert.rejects(
    encryptPortable(input, output, Buffer.from('passphrase')),
  );
  assert.equal(await fs.readFile(output, 'utf8'), 'keep');
});
