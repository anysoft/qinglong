import fs from 'fs/promises';
import { constants, Stats } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { TextDecoder } from 'util';
import { execFile } from 'child_process';
import { promisify } from 'util';
import config from '../config';
import { WorkspaceError } from '../shared/workspaceError';

export const EDIT_LIMIT = 2 * 1024 * 1024;
export const VIEW_LIMIT = 10 * 1024 * 1024;
export function workspaceFail(code: string, status = 409): never {
  throw new WorkspaceError(code, code, status);
}
export function workspaceRelative(value: string, root = false) {
  if (root && value === '') return value;
  if (
    typeof value !== 'string' ||
    !value ||
    Buffer.byteLength(value) > 4096 ||
    /[\\\x00-\x1f\x7f]/.test(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').some((s) => !s || s === '.' || s === '..')
  )
    workspaceFail('WORKSPACE_PATH_INVALID', 400);
  if (
    value
      .split('/')
      .some(
        (s) =>
          s.toLowerCase() === '.git' ||
          /^\.platform-(?:run-|node-|workspace-)/.test(s),
      )
  )
    workspaceFail('WORKSPACE_PATH_FORBIDDEN', 403);
  return value;
}
const hash = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex');
const exists = (file: string) =>
  fs.lstat(file).catch((e) => {
    if (e.code === 'ENOENT') return null;
    throw e;
  });
const sync = async (directory: string) => {
  const fd = await fs.open(directory, constants.O_RDONLY);
  try {
    await fd.sync();
  } finally {
    await fd.close();
  }
};
function decode(data: Buffer) {
  if (data.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      data,
    );
  } catch {
    return null;
  }
}
/** All callers must retain the canonical Worktree lease for this object's lifetime. */
export class WorkspaceFiles {
  constructor(
    readonly root: string,
    private renameExclusive?: (source: string, target: string) => Promise<void>,
  ) {}
  async target(relative: string, allowMissing = false, root = false) {
    workspaceRelative(relative, root);
    let current = this.root;
    const base = await fs.lstat(current);
    if (!base.isDirectory() || base.isSymbolicLink())
      workspaceFail('WORKSPACE_PATH_FORBIDDEN');
    const segments = relative ? relative.split('/') : [];
    for (let i = 0; i < segments.length; i++) {
      current = path.join(current, segments[i]);
      const info = await exists(current);
      if (!info) {
        if (allowMissing) return path.join(this.root, relative);
        workspaceFail('WORKSPACE_FILE_NOT_FOUND', 404);
      }
      if (
        i < segments.length - 1 &&
        (!info.isDirectory() || info.isSymbolicLink())
      )
        workspaceFail('WORKSPACE_PATH_FORBIDDEN', 403);
    }
    return current;
  }
  private regular(stat: Stats) {
    if (stat.isSymbolicLink()) workspaceFail('WORKSPACE_PATH_FORBIDDEN', 403);
    if (!stat.isFile()) workspaceFail('WORKSPACE_SPECIAL_FILE');
    if (stat.nlink !== 1) workspaceFail('WORKSPACE_PATH_FORBIDDEN', 403);
  }
  async bytes(relative: string, limit = VIEW_LIMIT) {
    const file = await this.target(relative);
    // O_NONBLOCK prevents a concurrent FIFO substitution from hanging open().
    const handle = await fs.open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await handle.stat();
      this.regular(stat);
      if (stat.size > limit) workspaceFail('WORKSPACE_FILE_TOO_LARGE');
      const data = Buffer.alloc(Math.min(stat.size + 1, limit + 1));
      let length = 0;
      while (length < data.length) {
        const n = (
          await handle.read(data, length, data.length - length, length)
        ).bytesRead;
        if (!n) break;
        length += n;
      }
      const after = await handle.stat();
      if (length > limit) workspaceFail('WORKSPACE_FILE_TOO_LARGE');
      if (
        after.size !== stat.size ||
        after.mtimeMs !== stat.mtimeMs ||
        after.ctimeMs !== stat.ctimeMs ||
        length !== stat.size
      )
        workspaceFail('WORKSPACE_FILE_CONFLICT');
      return { stat, data: data.subarray(0, length) };
    } finally {
      await handle.close();
    }
  }
  async metadata(relative: string) {
    const file = await this.target(relative),
      stat = await fs.lstat(file);
    if (stat.isFile() && stat.nlink !== 1)
      workspaceFail('WORKSPACE_PATH_FORBIDDEN', 403);
    const kind = stat.isFile()
      ? 'file'
      : stat.isDirectory()
      ? 'directory'
      : stat.isSymbolicLink()
      ? 'symlink'
      : 'special';
    if (kind === 'special') workspaceFail('WORKSPACE_SPECIAL_FILE');
    const identity = hash(
      `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.mode}`,
    );
    let link: string | undefined,
      unsafe = false;
    if (kind === 'symlink') {
      const raw = await fs.readlink(file);
      const resolved = path.relative(
        this.root,
        path.resolve(path.dirname(file), raw),
      );
      unsafe =
        path.isAbsolute(raw) ||
        /^[A-Za-z]:/.test(raw) ||
        /[\\\x00-\x1f\x7f]/.test(raw) ||
        resolved === '..' ||
        resolved.startsWith('../');
      if (!unsafe) link = raw;
    }
    return {
      path: relative,
      name: path.basename(relative),
      kind,
      size: stat.size,
      mode: stat.mode & 0o777,
      mtime: stat.mtime.toISOString(),
      identity,
      ...(kind === 'symlink'
        ? { link, error_code: unsafe ? 'UNSAFE_SYMLINK' : undefined }
        : {}),
    };
  }
  async read(relative: string) {
    const meta = await this.metadata(relative);
    if (meta.kind !== 'file') return { ...meta, editable: false };
    if (meta.size > VIEW_LIMIT)
      return {
        ...meta,
        editable: false,
        error_code: 'WORKSPACE_FILE_TOO_LARGE',
      };
    const { data } = await this.bytes(relative),
      text = decode(data);
    const bom = data.subarray(0, 3).equals(Buffer.from([239, 187, 191]));
    return {
      ...meta,
      hash: hash(data),
      binary: text === null,
      encoding: text === null ? null : 'utf-8',
      bom,
      eol: text?.includes('\r\n') ? 'CRLF' : 'LF',
      editable: text !== null && data.length <= EDIT_LIMIT,
      ...(text === null
        ? { error_code: 'WORKSPACE_BINARY_NOT_EDITABLE' }
        : { content: bom ? text.slice(1) : text }),
    };
  }
  async tree(relative = '', offset = 0, limit = 200) {
    const target = await this.target(relative, false, true),
      stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      workspaceFail('WORKSPACE_PATH_FORBIDDEN');
    const rows: { name: string; directory: boolean }[] = [];
    const directory = await fs.opendir(target);
    for await (const entry of directory) {
      try {
        workspaceRelative(relative ? relative + '/' + entry.name : entry.name);
      } catch {
        continue;
      }
      rows.push({ name: entry.name, directory: entry.isDirectory() });
      if (rows.length > 100000) workspaceFail('WORKSPACE_DIRECTORY_TOO_LARGE');
    }
    rows.sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
    const items = [];
    for (const entry of rows.slice(offset, offset + Math.min(limit, 1000))) {
      try {
        items.push(
          await this.metadata(
            relative ? relative + '/' + entry.name : entry.name,
          ),
        );
      } catch (e: any) {
        if (e.error_code === 'WORKSPACE_SPECIAL_FILE')
          items.push({
            path: relative ? relative + '/' + entry.name : entry.name,
            name: entry.name,
            kind: 'special',
            error_code: e.error_code,
          });
        else throw e;
      }
    }
    return {
      items,
      total: rows.length,
      next: offset + items.length < rows.length ? offset + items.length : null,
    };
  }
  private async expected(
    relative: string,
    expected: string,
    directory = false,
  ) {
    if (!expected || !/^[a-f0-9]{64}$/.test(expected))
      workspaceFail('WORKSPACE_FILE_CONFLICT');
    const meta = await this.metadata(relative);
    if (meta.kind === 'symlink') workspaceFail('WORKSPACE_PATH_FORBIDDEN');
    const actual =
      directory && (meta.kind === 'directory' || meta.size > VIEW_LIMIT)
        ? meta.identity
        : hash((await this.bytes(relative)).data);
    if (actual !== expected) workspaceFail('WORKSPACE_FILE_CONFLICT');
    return meta;
  }
  async save(relative: string, content: string, expectedHash: string) {
    const prior = await this.read(relative);
    if (prior.kind !== 'file') workspaceFail('WORKSPACE_PATH_FORBIDDEN', 403);
    if (!prior.editable)
      workspaceFail((prior as any).error_code || 'WORKSPACE_FILE_TOO_LARGE');
    await this.expected(relative, expectedHash);
    const normalized = content.replace(/\r\n/g, '\n');
    const text =
      (prior as any).eol === 'CRLF'
        ? normalized.replace(/\n/g, '\r\n')
        : normalized;
    const bytes = Buffer.from(((prior as any).bom ? '\uFEFF' : '') + text);
    if (bytes.length > EDIT_LIMIT) workspaceFail('WORKSPACE_FILE_TOO_LARGE');
    if (decode(bytes) === null) workspaceFail('WORKSPACE_BINARY_NOT_EDITABLE');
    const target = await this.target(relative),
      temporary = path.join(
        path.dirname(target),
        '.platform-workspace-' + randomUUID(),
      );
    const rollback = temporary + '.rollback';
    let published = false,
      rollbackReady = false,
      retainRollback = false;
    let stagedIdentity: { dev: number; ino: number } | undefined;
    try {
      const original = await fs.open(rollback, 'wx', 0o600);
      try {
        await original.writeFile(
          Buffer.from(
            ((prior as any).bom ? '\uFEFF' : '') + (prior as any).content,
          ),
        );
        await original.chmod(prior.mode);
        await original.sync();
        rollbackReady = true;
      } finally {
        await original.close();
      }
      const fd = await fs.open(temporary, 'wx', 0o600);
      try {
        await fd.writeFile(bytes);
        await fd.chmod(prior.mode);
        await fd.sync();
        const stat = await fd.stat();
        stagedIdentity = { dev: stat.dev, ino: stat.ino };
      } finally {
        await fd.close();
      }
      await this.target(relative);
      await this.expected(relative, expectedHash);
      await fs.rename(temporary, target);
      published = true;
      await sync(path.dirname(target));
      const result = await this.read(relative);
      await fs.unlink(rollback);
      rollbackReady = false;
      return result;
    } catch (error) {
      if (published && rollbackReady) {
        try {
          const current = await fs.lstat(await this.target(relative));
          if (
            current.dev !== stagedIdentity?.dev ||
            current.ino !== stagedIdentity?.ino
          )
            workspaceFail('WORKSPACE_FILE_CONFLICT');
          await fs.rename(rollback, target);
          rollbackReady = false;
          await sync(path.dirname(target));
        } catch {
          // Preserve the original copy if rollback itself cannot complete.
          retainRollback = rollbackReady;
          workspaceFail('WORKSPACE_RECOVERY_REQUIRED');
        }
      }
      throw error;
    } finally {
      if (!published)
        await fs.unlink(temporary).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
      if (!published && !retainRollback)
        await fs.unlink(rollback).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
    }
  }

  async create(relative: string, content = '', directory = false) {
    const target = await this.target(relative, true);
    const data = Buffer.from(content.replace(/\r\n/g, '\n'));
    if (data.length > EDIT_LIMIT) workspaceFail('WORKSPACE_FILE_TOO_LARGE');
    if (decode(data) === null) workspaceFail('WORKSPACE_BINARY_NOT_EDITABLE');
    try {
      if (directory) await fs.mkdir(target, { mode: 0o755 });
      else {
        const temporary = path.join(
          path.dirname(target),
          '.platform-workspace-' + randomUUID(),
        );
        try {
          const fd = await fs.open(temporary, 'wx', 0o600);
          try {
            await fd.writeFile(data);
            await fd.chmod(0o644);
            await fd.sync();
          } finally {
            await fd.close();
          }
          await this.target(relative, true);
          await fs.link(temporary, target);
        } finally {
          await fs.unlink(temporary).catch((e) => {
            if (e.code !== 'ENOENT') throw e;
          });
        }
      }
    } catch (e: any) {
      if (e.code === 'EEXIST') workspaceFail('WORKSPACE_DESTINATION_EXISTS');
      throw e;
    }
    await sync(path.dirname(target));
    return directory ? this.metadata(relative) : this.read(relative);
  }
  async remove(relative: string, expected: string) {
    const meta = await this.expected(relative, expected, true),
      target = await this.target(relative);
    if (meta.kind === 'directory') {
      try {
        await fs.rmdir(target);
      } catch (e: any) {
        if (['ENOTEMPTY', 'EEXIST'].includes(e.code))
          workspaceFail('WORKSPACE_DIRECTORY_NOT_EMPTY');
        throw e;
      }
    } else await fs.unlink(target);
    await sync(path.dirname(target));
    return { deleted: true };
  }
  async rename(relative: string, destination: string, expected: string) {
    if (destination.startsWith(relative + '/'))
      workspaceFail('WORKSPACE_PATH_INVALID', 400);
    await this.expected(relative, expected, true);
    const source = await this.target(relative),
      target = await this.target(destination, true);
    if (await exists(target)) workspaceFail('WORKSPACE_DESTINATION_EXISTS');
    try {
      if (this.renameExclusive) await this.renameExclusive(source, target);
      else
        await promisify(execFile)(
          '/usr/bin/python3',
          [
            '-I',
            '-S',
            path.join(config.rootPath, 'shell/workspace_rename.py'),
            source,
            target,
          ],
          { timeout: 5000 },
        );
    } catch (e: any) {
      workspaceFail(
        e.code === 17
          ? 'WORKSPACE_DESTINATION_EXISTS'
          : 'WORKSPACE_RENAME_FAILED',
      );
    }
    await sync(path.dirname(source));
    if (path.dirname(source) !== path.dirname(target))
      await sync(path.dirname(target));
    return this.metadata(destination);
  }
  async search(query: string, content = false) {
    if (!query || query.length > 256)
      workspaceFail('WORKSPACE_SEARCH_INVALID', 400);
    const pending = [''],
      items: { path: string; line?: number; text?: string }[] = [];
    let scanned = 0,
      bytes = 0,
      truncated = false;
    const deadline = Date.now() + 3000;
    outer: while (pending.length) {
      const relative = pending.pop()!,
        target = await this.target(relative, false, true),
        directory = await fs.opendir(target);
      for await (const entry of directory) {
        if (
          ++scanned > 10000 ||
          Date.now() > deadline ||
          bytes > 32 * 1024 * 1024 ||
          items.length >= 200
        ) {
          truncated = true;
          break outer;
        }
        const name = relative ? relative + '/' + entry.name : entry.name;
        try {
          workspaceRelative(name);
        } catch {
          continue;
        }
        if (entry.isDirectory()) {
          if (name.split('/').length < 64) pending.push(name);
          else truncated = true;
          continue;
        }
        if (!entry.isFile()) continue;
        if (!content) {
          if (name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
            items.push({ path: name });
          continue;
        }
        try {
          const value = await this.bytes(name, 256 * 1024);
          bytes += value.data.length;
          const text = decode(value.data);
          if (text === null) continue;
          const lines = text.split('\n');
          for (let i = 0; i < lines.length; i++)
            if (lines[i].includes(query)) {
              items.push({
                path: name,
                line: i + 1,
                text: lines[i].slice(0, 500),
              });
              if (items.length >= 200) {
                truncated = true;
                break outer;
              }
            }
        } catch (e: any) {
          if (
            !['WORKSPACE_FILE_TOO_LARGE', 'WORKSPACE_FILE_NOT_FOUND'].includes(
              e.error_code,
            )
          )
            throw e;
        }
      }
    }
    return { items, scanned, bytes, truncated };
  }
}
