import fs from 'fs/promises';
import { constants } from 'fs';
import ExecutionLog from './executionLog';
import ExecutionPaths from './executionPaths';
import { ExecutionError } from '../shared/execution';
import { TaskRunModel } from '../data/taskRun';
import { terminalStatuses, selectRows } from './runObservability';

export default class RunLogService {
  constructor(readonly paths = new ExecutionPaths()) {}
  async read(id: number, query: Record<string, any> = {}) {
    if (
      Object.keys(query).some(
        (k) => !['cursor', 'limit', 'tail', 'offset'].includes(k),
      )
    )
      throw new ExecutionError('LOG_QUERY_INVALID', 400);
    const run = await TaskRunModel.findByPk(id);
    if (!run) throw new ExecutionError('TASK_RUN_NOT_FOUND', 404);
    const limit = Number(query.limit ?? 65536);
    if (!Number.isSafeInteger(limit) || limit < 4 || limit > 262144)
      throw new ExecutionError('LOG_LIMIT_INVALID', 400);
    let offset = query.offset === undefined ? undefined : Number(query.offset),
      identity: string | undefined;
    if (query.cursor) {
      try {
        const c = JSON.parse(
          Buffer.from(String(query.cursor), 'base64url').toString(),
        );
        if (c.run !== id) throw Error();
        offset = c.offset;
        identity = c.identity;
      } catch {
        throw new ExecutionError('LOG_CURSOR_INVALID', 400);
      }
    }
    if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0))
      throw new ExecutionError('LOG_CURSOR_INVALID', 400);
    const terminal = terminalStatuses.includes(run.status);
    let handle;
    try {
      handle = await fs.open(
        await ExecutionLog.file(this.paths, id),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (e: any) {
      if (e.code === 'ENOENT')
        return { content: '', cursor: null, terminal, size: 0 };
      throw new ExecutionError('LOG_UNSAFE', 409);
    }
    try {
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        (process.getuid && stat.uid !== process.getuid()) ||
        (stat.mode & 0o077) !== 0
      )
        throw new ExecutionError('LOG_UNSAFE');
      const currentIdentity = `${stat.dev}:${stat.ino}`;
      if (identity && identity !== currentIdentity)
        throw new ExecutionError('LOG_CURSOR_STALE', 409);
      if (offset === undefined)
        offset =
          query.tail === 'false' || query.tail === false
            ? 0
            : Math.max(0, stat.size - limit);
      if (offset > stat.size) throw new ExecutionError('LOG_CURSOR_STALE', 409);
      const buffer = Buffer.alloc(Math.min(limit + 4, stat.size - offset));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
      let start = 0;
      while (start < bytesRead && (buffer[start] & 0xc0) === 0x80) start++;
      let end = Math.min(bytesRead, limit);
      while (end > start && end < bytesRead && (buffer[end] & 0xc0) === 0x80)
        end--;
      // Do not emit a partial trailing codepoint while a writer is still appending.
      if (end === bytesRead && end > start) {
        let lead = end - 1;
        while (lead > start && (buffer[lead] & 0xc0) === 0x80) lead--;
        const byte = buffer[lead],
          width = byte < 128 ? 1 : byte < 224 ? 2 : byte < 240 ? 3 : 4;
        if (end - lead < width) end = lead;
      }
      const next = offset + end;
      return {
        content: buffer.subarray(start, end).toString('utf8'),
        cursor: Buffer.from(
          JSON.stringify({ run: id, offset: next, identity: currentIdentity }),
        ).toString('base64url'),
        terminal: terminal && next >= stat.size,
        size: stat.size,
        offset: next,
      };
    } finally {
      await handle.close();
    }
  }
  async metadata(id: number) {
    try {
      const s = await fs.lstat(await ExecutionLog.file(this.paths, id));
      if (s.isFile() && !s.isSymbolicLink())
        await selectRows(
          'UPDATE TaskRuns SET log_size=:size,last_log_at=:modified WHERE id=:id',
          { id, size: s.size, modified: s.mtime },
        );
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
}
