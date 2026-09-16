import fs, { FileHandle } from 'fs/promises';
import { constants } from 'fs';
import ExecutionRedactor from './executionRedactor';
import RuntimePathResolver from './runtimePaths';
import {
  RUNTIME_LOG_LIMIT,
  RUNTIME_LOG_WINDOW,
  RuntimeError,
} from '../shared/runtime';

export default class RuntimeOperationLog {
  private redactor: ExecutionRedactor;
  private queue = Promise.resolve();
  private bytes = 0;
  private truncated = false;
  private constructor(private handle: FileHandle, secrets: string[]) {
    this.redactor = new ExecutionRedactor([], async (text) => {
      if (this.truncated) return;
      const buffer = Buffer.from(text);
      if (this.bytes + buffer.length > RUNTIME_LOG_LIMIT) {
        this.truncated = true;
        const marker = Buffer.from('\n[RUNTIME_LOG_TRUNCATED]\n');
        await handle.writeFile(marker);
        this.bytes += marker.length;
        return;
      }
      await handle.writeFile(buffer);
      this.bytes += buffer.length;
    });
    this.redactor.add(secrets);
  }
  static async open(
    paths: RuntimePathResolver,
    id: number,
    privateHome: string,
    base: NodeJS.ProcessEnv = process.env,
  ) {
    // Values are used only for redaction; never passed to provider/build children.
    const secrets = Object.entries(base)
      .filter(
        ([name, value]) =>
          /secret|token|password|credential|private_key/i.test(name) &&
          value &&
          value.length >= 4 &&
          value.length <= 65536,
      )
      .map(([, value]) => value!);
    const handle = await fs.open(
      await paths.log(id),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    return new RuntimeOperationLog(handle, [privateHome, ...secrets]);
  }
  write(text: string) {
    this.queue = this.queue.then(() => this.redactor.write(text));
    return this.queue;
  }
  async close() {
    try {
      await this.queue;
      await this.redactor.flush();
      await this.handle.sync();
    } finally {
      await this.handle.close();
    }
  }
  static async read(paths: RuntimePathResolver, id: number) {
    let handle: FileHandle;
    try {
      handle = await fs.open(
        await paths.log(id),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return { text: '', size: 0, truncated: false };
      throw new RuntimeError('RUNTIME_LOG_UNAVAILABLE');
    }
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new RuntimeError('RUNTIME_LOG_UNAVAILABLE');
      const buffer = Buffer.alloc(Math.min(stat.size, RUNTIME_LOG_WINDOW));
      const { bytesRead } = await handle.read(
        buffer,
        0,
        buffer.length,
        Math.max(0, stat.size - buffer.length),
      );
      let start = 0;
      if (stat.size > buffer.length)
        while (start < bytesRead && (buffer[start] & 0xc0) === 0x80) start++;
      return {
        text: buffer.subarray(start, bytesRead).toString('utf8'),
        size: stat.size,
        truncated: stat.size > buffer.length,
      };
    } finally {
      await handle.close();
    }
  }
}
