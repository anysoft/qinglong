import fs, { FileHandle } from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import {
  fail,
  relativeName,
  safeLink,
  openRegular,
  privateDirectory,
  writeAll,
} from './files';

export interface ArchiveLimits {
  entries: number;
  bytes: number;
  entryBytes: number;
}
export const DEFAULT_LIMITS: ArchiveLimits = {
  entries: 1000000,
  bytes: 1024 ** 4,
  entryBytes: 128 * 1024 ** 3,
};
const MAGIC = Buffer.from('PLATARC1');
export interface ArchiveEntry {
  path: string;
  kind: 'file' | 'directory' | 'symlink';
  size: number;
  mode: number;
  link?: string;
}
function entry(value: any): ArchiveEntry {
  if (
    !value ||
    !['file', 'directory', 'symlink'].includes(value.kind) ||
    !Number.isSafeInteger(value.size) ||
    value.size < 0 ||
    !Number.isInteger(value.mode) ||
    value.mode < 0 ||
    value.mode > 0o777 ||
    Object.keys(value).some(
      (k) => !['path', 'kind', 'size', 'mode', 'link'].includes(k),
    )
  )
    fail('BACKUP_ARCHIVE_INVALID');
  relativeName(value.path);
  if (value.kind !== 'file' && value.size !== 0) fail('BACKUP_ARCHIVE_INVALID');
  if (value.kind === 'symlink') safeLink(value.path, value.link);
  else if (value.link !== undefined) fail('BACKUP_ARCHIVE_INVALID');
  return value;
}
/** Resolve link components with filesystem semantics, including symlink followed by '..'. */
export async function validateLink(root: string, name: string, link: string) {
  safeLink(name, link);
  const pending = [
    ...path.posix
      .dirname(name)
      .split('/')
      .filter((x) => x !== '.'),
    ...link.split('/'),
  ];
  const resolved: string[] = [];
  let links = 0;
  while (pending.length) {
    const part = pending.shift()!;
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!resolved.length) fail('BACKUP_SOURCE_UNSAFE_SYMLINK');
      resolved.pop();
      continue;
    }
    resolved.push(part);
    const stat = await fs.lstat(path.join(root, ...resolved)).catch((e) => {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
      throw e;
    });
    if (stat?.isSymbolicLink()) {
      if (++links > 40) fail('BACKUP_SOURCE_UNSAFE_SYMLINK');
      const target = await fs.readlink(path.join(root, ...resolved));
      safeLink(resolved.join('/'), target);
      resolved.pop();
      pending.unshift(...target.split('/'));
    }
  }
}
async function* walk(
  root: string,
  directory = '',
  depth = 0,
): AsyncGenerator<ArchiveEntry> {
  if (depth > 128) fail('BACKUP_LIMIT');
  const handle = await fs.opendir(path.join(root, directory));
  for await (const item of handle) {
    const name = directory ? directory + '/' + item.name : item.name;
    relativeName(name);
    const source = path.join(root, name),
      stat = await fs.lstat(source);
    if (process.getuid && stat.uid !== process.getuid())
      fail('BACKUP_FILE_INVALID');
    if (stat.isDirectory()) {
      yield { path: name, kind: 'directory', size: 0, mode: stat.mode & 0o777 };
      yield* walk(root, name, depth + 1);
    } else if (stat.isFile()) {
      if (stat.nlink !== 1) fail('BACKUP_FILE_INVALID');
      yield {
        path: name,
        kind: 'file',
        size: stat.size,
        mode: stat.mode & 0o777,
      };
    } else if (stat.isSymbolicLink()) {
      const link = await fs.readlink(source);
      await validateLink(root, name, link);
      yield { path: name, kind: 'symlink', size: 0, mode: 0o777, link };
    } else fail('BACKUP_SOURCE_SPECIAL_FILE');
  }
}
/** Simple framed archive, no compression or hardlinks. Constant-memory file transfer. */
export async function packArchive(
  root: string,
  output: string,
  limits = DEFAULT_LIMITS,
) {
  await privateDirectory(root);
  await privateDirectory(path.dirname(output));
  const relativeOutput = path.relative(
    path.resolve(root),
    path.resolve(output),
  );
  if (
    !relativeOutput ||
    (!relativeOutput.startsWith(`..${path.sep}`) &&
      relativeOutput !== '..' &&
      !path.isAbsolute(relativeOutput))
  )
    fail('BACKUP_DESTINATION_INSIDE_SOURCE');
  const target = await fs.open(output, 'wx', 0o600);
  let count = 0,
    bytes = 0;
  try {
    await writeAll(target, MAGIC);
    for await (const metadata of walk(root)) {
      if (
        ++count > limits.entries ||
        metadata.size > limits.entryBytes ||
        (bytes += metadata.size) > limits.bytes
      )
        fail('BACKUP_LIMIT');
      const json = Buffer.from(JSON.stringify(metadata)),
        length = Buffer.alloc(4);
      length.writeUInt32BE(json.length);
      await writeAll(target, length);
      await writeAll(target, json);
      if (metadata.kind === 'file') {
        const input = await openRegular(path.join(root, metadata.path), false);
        let actual = 0;
        const hash = createHash('sha256');
        try {
          for await (const chunk of input.createReadStream({
            autoClose: false,
          })) {
            actual += chunk.length;
            if (actual > metadata.size) fail('BACKUP_SOURCE_CHANGED');
            hash.update(chunk);
            await writeAll(target, chunk);
          }
        } finally {
          await input.close();
        }
        if (actual !== metadata.size) fail('BACKUP_SOURCE_CHANGED');
        await writeAll(target, hash.digest());
      }
    }
    await writeAll(target, Buffer.alloc(4));
    await target.sync();
    return { entries: count, bytes };
  } catch (e) {
    await fs.unlink(output).catch(() => {});
    throw e;
  } finally {
    await target.close();
  }
}
class Reader {
  private position = 0;
  constructor(private handle: FileHandle) {}
  async read(length: number) {
    const value = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const r = await this.handle.read(
        value,
        offset,
        length - offset,
        this.position,
      );
      if (!r.bytesRead) fail('BACKUP_ARCHIVE_TRUNCATED');
      offset += r.bytesRead;
      this.position += r.bytesRead;
    }
    return value;
  }
  async ended() {
    return this.position === (await this.handle.stat()).size;
  }
}
/** root must be a newly-created private empty candidate. Never extracts over live data. */
export async function unpackArchive(
  source: string,
  root: string,
  limits = DEFAULT_LIMITS,
) {
  await privateDirectory(root);
  if ((await fs.readdir(root)).length) fail('BACKUP_CANDIDATE_NOT_EMPTY');
  const input = await openRegular(source),
    reader = new Reader(input);
  let count = 0,
    bytes = 0;
  try {
    if (!(await reader.read(8)).equals(MAGIC)) fail('BACKUP_ARCHIVE_INVALID');
    while (true) {
      const length = (await reader.read(4)).readUInt32BE();
      if (!length) break;
      if (length > 16384 || ++count > limits.entries) fail('BACKUP_LIMIT');
      let metadata: ArchiveEntry;
      try {
        metadata = entry(
          JSON.parse((await reader.read(length)).toString('utf8')),
        );
      } catch (e) {
        if ((e as Error).message.startsWith('BACKUP_')) throw e;
        fail('BACKUP_ARCHIVE_INVALID');
      }
      if (
        metadata!.size > limits.entryBytes ||
        (bytes += metadata!.size) > limits.bytes
      )
        fail('BACKUP_LIMIT');
      const target = path.join(root, metadata!.path);
      await privateDirectory(path.dirname(target)); // Parent must already exist and cannot be a symlink.
      if (metadata!.kind === 'directory') {
        await fs.mkdir(target, { mode: 0o700 });
      } else if (metadata!.kind === 'symlink') {
        // Reserve the name exclusively so later duplicate/file entries cannot overwrite it.
        await fs.symlink(metadata!.link!, target);
      } else {
        const out = await fs.open(target, 'wx', 0o600),
          hash = createHash('sha256');
        let remaining = metadata!.size;
        try {
          while (remaining) {
            const chunk = await reader.read(Math.min(65536, remaining));
            remaining -= chunk.length;
            hash.update(chunk);
            await writeAll(out, chunk);
          }
          if (!(await reader.read(32)).equals(hash.digest()))
            fail('BACKUP_CHECKSUM_FAILED');
          await out.sync();
        } finally {
          await out.close();
        }
      }
    }
    if (!(await reader.ended())) fail('BACKUP_ARCHIVE_TRAILING_DATA');
    // A second bounded traversal validates links after all targets exist.
    // Do not retain up to a million link paths in memory during extraction.
    for await (const _ of walk(root)) {
      /* walk validates each link */
    }
    return { entries: count, bytes };
  } finally {
    await input.close();
  }
}
