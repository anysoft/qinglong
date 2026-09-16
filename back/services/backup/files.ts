import fs, { FileHandle } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';

export class BackupError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export const fail = (code: string): never => {
  throw new BackupError(code);
};
export const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
export function relativeName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    Buffer.byteLength(value) > 4096 ||
    /[\\\x00-\x1f\x7f:]/.test(value) ||
    value.split('/').some((x) => !x || x === '.' || x === '..')
  )
    fail('BACKUP_PATH_INVALID');
  return value as string;
}
export function safeLink(name: string, link: unknown) {
  relativeName(name);
  if (
    typeof link !== 'string' ||
    !link ||
    link.startsWith('/') ||
    /[\\\x00-\x1f\x7f:]/.test(link) ||
    Buffer.byteLength(link) > 4096
  )
    fail('BACKUP_SOURCE_UNSAFE_SYMLINK');
  const target = path.posix.normalize(
    path.posix.join(path.posix.dirname(name), link as string),
  );
  if (target === '..' || target.startsWith('../') || target.startsWith('/'))
    fail('BACKUP_SOURCE_UNSAFE_SYMLINK');
  return link as string;
}
export async function privateDirectory(directory: string, create = false) {
  const absolute = path.resolve(directory);
  let current = path.parse(absolute).root;
  for (const part of absolute
    .slice(current.length)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    if (create)
      await fs.mkdir(current, { mode: 0o700 }).catch((e) => {
        if (e.code !== 'EEXIST') throw e;
      });
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      fail('BACKUP_PATH_INVALID');
  }
  const stat = await fs.lstat(absolute);
  if ((process.getuid && stat.uid !== process.getuid()) || stat.mode & 0o077)
    fail('BACKUP_PERMISSION_INVALID');
  return absolute;
}
export async function openRegular(file: string, privateFile = true) {
  const handle = await fs.open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (process.getuid && stat.uid !== process.getuid()) ||
      (privateFile && stat.mode & 0o077)
    )
      fail('BACKUP_FILE_INVALID');
    return handle;
  } catch (e) {
    await handle.close();
    throw e;
  }
}
export async function syncDirectory(directory: string) {
  const handle = await fs.open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
export async function privateJson(file: string, data: unknown) {
  await privateDirectory(path.dirname(file));
  const temporary = path.join(path.dirname(file), '.write-' + randomUUID());
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(data) + '\n');
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } finally {
    await fs.unlink(temporary).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
}
export async function readJson(file: string, max = 1024 * 1024) {
  const handle = await openRegular(file);
  try {
    if ((await handle.stat()).size > max) fail('BACKUP_LIMIT');
    return JSON.parse(await handle.readFile('utf8'));
  } finally {
    await handle.close();
  }
}
export async function hashFile(file: string) {
  const handle = await openRegular(file),
    hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      hash.update(chunk);
    }
  } finally {
    await handle.close();
  }
  return { size, sha256: hash.digest('hex') };
}
export async function writeAll(handle: FileHandle, bytes: Buffer) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset);
    if (!result.bytesWritten) fail('BACKUP_WRITE_FAILED');
    offset += result.bytesWritten;
  }
}
