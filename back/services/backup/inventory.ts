import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { createInterface } from 'readline';
import {
  fail,
  openRegular,
  privateDirectory,
  relativeName,
  writeAll,
  syncDirectory,
  hashFile,
} from './files';
import { validateLink } from './archive';
export interface InventoryEntry {
  path: string;
  kind: 'directory' | 'file' | 'symlink';
  mode: number;
  size: number;
  sha256?: string;
  link?: string;
}
export interface CopyProgress {
  processed_bytes: number;
  processed_files: number;
}
export async function* inventoryLines(
  file: string,
): AsyncGenerator<InventoryEntry> {
  const input = await openRegular(file);
  let count = 0;
  try {
    let pending = Buffer.alloc(0);
    for await (const chunk of input.createReadStream({
      autoClose: false,
      highWaterMark: 16384,
    })) {
      pending = Buffer.concat([pending, chunk]);
      let newline: number;
      while ((newline = pending.indexOf(10)) >= 0) {
        if (newline > 16384 || ++count > 1000000) fail('BACKUP_LIMIT');
        const row = JSON.parse(pending.subarray(0, newline).toString('utf8'));
        pending = pending.subarray(newline + 1);
        relativeName(row.path);
        if (
          !['directory', 'file', 'symlink'].includes(row.kind) ||
          !Number.isInteger(row.mode) ||
          row.mode < 0 ||
          row.mode > 0o777 ||
          !Number.isSafeInteger(row.size) ||
          row.size < 0
        )
          fail('BACKUP_MANIFEST_INVALID');
        yield row;
      }
      if (pending.length > 16384) fail('BACKUP_LIMIT');
    }
    if (pending.length) fail('BACKUP_MANIFEST_INVALID');
  } finally {
    await input.close();
  }
}
/** Snapshot files stay 0600; original modes live only in authenticated inventory. */
export async function copyInventory(
  source: string,
  destination: string,
  inventory: string,
  exclude: (relative: string) => boolean,
  progress: CopyProgress,
) {
  await privateDirectory(source);
  await privateDirectory(destination);
  const output = await fs.open(inventory, 'wx', 0o600);
  let total = 0,
    count = 0;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 128) fail('BACKUP_LIMIT');
    const entries = await fs.opendir(path.join(source, dir));
    for await (const entry of entries) {
      const name = dir ? dir + '/' + entry.name : entry.name;
      relativeName(name);
      if (exclude(name)) continue;
      progress.processed_files++;
      if (++count > 1000000) fail('BACKUP_LIMIT');
      const src = path.join(source, name),
        dst = path.join(destination, name),
        stat = await fs.lstat(src);
      if (process.getuid && stat.uid !== process.getuid())
        fail('BACKUP_FILE_INVALID');
      const row: InventoryEntry = {
        path: name,
        kind: 'file',
        mode: stat.mode & 0o777,
        size: 0,
      };
      if (stat.isDirectory()) {
        row.kind = 'directory';
        await fs.mkdir(dst, { mode: 0o700 });
        await writeAll(output, Buffer.from(JSON.stringify(row) + '\n'));
        await walk(name, depth + 1);
        await syncDirectory(dst);
        continue;
      }
      if (stat.isSymbolicLink()) {
        row.kind = 'symlink';
        row.link = await fs.readlink(src);
        await validateLink(source, name, row.link);
        await fs.symlink(row.link, dst);
      } else if (stat.isFile()) {
        if (stat.size > 128 * 1024 ** 3 || (total += stat.size) > 1024 ** 4)
          fail('BACKUP_LIMIT');
        const input = await openRegular(src, false),
          out = await fs.open(dst, 'wx', 0o600),
          hash = createHash('sha256');
        try {
          for await (const chunk of input.createReadStream({
            autoClose: false,
          })) {
            row.size += chunk.length;
            if (row.size > stat.size) fail('BACKUP_SOURCE_CHANGED');
            hash.update(chunk);
            await writeAll(out, chunk);
            progress.processed_bytes += chunk.length;
          }
          if (row.size !== stat.size) fail('BACKUP_SOURCE_CHANGED');
          await out.sync();
          row.sha256 = hash.digest('hex');
        } finally {
          await input.close();
          await out.close();
        }
      } else fail('BACKUP_SOURCE_SPECIAL_FILE');
      await writeAll(output, Buffer.from(JSON.stringify(row) + '\n'));
    }
  };
  try {
    await walk('', 0);
    await output.sync();
  } finally {
    await output.close();
  }
  await syncDirectory(destination);
  return { files: count, bytes: total, ...(await hashFile(inventory)) };
}
export async function validateInventory(
  root: string,
  inventory: string,
  restoreModes = false,
) {
  let count = 0,
    bytes = 0,
    pathBytes = 0;
  const expected = new Set<string>();
  for await (const row of inventoryLines(inventory)) {
    if ((pathBytes += Buffer.byteLength(row.path)) > 64 * 1024 * 1024)
      fail('BACKUP_LIMIT');
    if (expected.has(row.path)) fail('BACKUP_MANIFEST_INVALID');
    expected.add(row.path);
    const file = path.join(root, row.path);
    await privateDirectory(path.dirname(file));
    const stat = await fs.lstat(file);
    count++;
    if (process.getuid && stat.uid !== process.getuid())
      fail('BACKUP_FILE_INVALID');
    if (row.kind === 'directory') {
      if (!stat.isDirectory() || stat.isSymbolicLink())
        fail('BACKUP_CHECKSUM_FAILED');
    } else if (row.kind === 'symlink') {
      if (!stat.isSymbolicLink() || (await fs.readlink(file)) !== row.link)
        fail('BACKUP_CHECKSUM_FAILED');
      await validateLink(root, row.path, row.link!);
    } else {
      if (!stat.isFile() || stat.size !== row.size)
        fail('BACKUP_CHECKSUM_FAILED');
      const actual = await hashFile(file);
      if (actual.sha256 !== row.sha256) fail('BACKUP_CHECKSUM_FAILED');
      bytes += actual.size;
    }
    if (
      !restoreModes &&
      !stat.isSymbolicLink() &&
      (stat.mode & 0o777) !== (row.kind === 'directory' ? 0o700 : 0o600)
    )
      fail('BACKUP_MODE_INVALID');
  }
  const walk = async (dir: string): Promise<void> => {
    for await (const entry of await fs.opendir(path.join(root, dir))) {
      const name = dir ? dir + '/' + entry.name : entry.name;
      if (!expected.delete(name)) fail('BACKUP_UNEXPECTED_FILE');
      if (entry.isDirectory()) await walk(name);
    }
  };
  await walk('');
  if (expected.size) fail('BACKUP_CHECKSUM_FAILED');
  // Apply file modes only; directory owner rwx is required for platform management.
  if (restoreModes)
    for await (const row of inventoryLines(inventory))
      if (row.kind === 'file')
        await fs.chmod(path.join(root, row.path), row.mode);
  return { files: count, bytes };
}
