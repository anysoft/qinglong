import fs, { FileHandle } from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import ExecutionPaths from './executionPaths';
import { ExecutionError } from '../shared/execution';
export default class ExecutionLog {
  private pending = Promise.resolve();
  private constructor(private handle: FileHandle) {}
  static async file(paths: ExecutionPaths, runId: number) {
    if (!Number.isSafeInteger(runId) || runId < 1)
      throw new ExecutionError('EXECUTION_ID_INVALID');
    return path.join(
      await paths.directory('log/task-runs', true),
      `run-${runId}.log`,
    );
  }
  static async open(paths: ExecutionPaths, runId: number) {
    const handle = await fs.open(
      await this.file(paths, runId),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_APPEND |
        constants.O_NOFOLLOW,
      0o600,
    );
    const stat = await handle.stat();
    if (!stat.isFile() || (process.getuid && stat.uid !== process.getuid())) {
      await handle.close();
      throw new ExecutionError('EXECUTION_LOG_UNSAFE');
    }
    return new ExecutionLog(handle);
  }
  write(text: string) {
    this.pending = this.pending.then(async () => {
      await this.handle.writeFile(text);
    });
    return this.pending;
  }
  async close() {
    try {
      await this.pending;
      await this.handle.sync();
    } finally {
      await this.handle.close();
    }
  }
  static async read(paths: ExecutionPaths, runId: number) {
    const handle = await fs
      .open(
        await this.file(paths, runId),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      )
      .catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
    if (!handle) return '';
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new ExecutionError('EXECUTION_LOG_UNSAFE');
      const size = Math.min(stat.size, 4 * 1024 * 1024),
        buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, Math.max(0, stat.size - size));
      // A tail window may begin in the middle of a UTF-8 codepoint.
      let start = 0;
      if (stat.size > size)
        while (start < buffer.length && (buffer[start] & 0xc0) === 0x80)
          start++;
      return buffer.subarray(start).toString('utf8');
    } finally {
      await handle.close();
    }
  }
}
