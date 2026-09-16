import fs from 'fs/promises';
import { executionSocketAddress } from '../shared/executionSocket';
import path from 'path';
import net from 'net';
import ExecutionService, { executionService } from './executionService';
import RuntimePathResolver from './runtimePaths';
import { RuntimeLease } from './runtimeProcess';
import { ExecutionError, safeExecutionError } from '../shared/execution';
class SubmissionLock extends RuntimePathResolver {
  async lock() {
    return path.join(
      await this.directory('.locks', true),
      'execution-submission.lock',
    );
  }
}
/** Local system-cron adapter: directory 0700, socket 0600, Task ID only. */
export class ExecutionSubmissionServer {
  private server?: net.Server;
  private lease?: RuntimeLease;
  private starting?: Promise<void>;
  // SQLite has one writer. Concurrent BEGIN IMMEDIATE calls can occupy the
  // native worker pool while the transaction owning the lock waits to finish.
  private submissions: Promise<void> = Promise.resolve();
  private queuedSubmissions = 0;
  constructor(private execution: ExecutionService) {}
  start() {
    return (this.starting ??= this.listen());
  }
  private async listen() {
    this.lease = await RuntimeLease.acquire(
      new SubmissionLock(this.execution.paths.dataRoot),
      1,
    );
    const file = executionSocketAddress(this.execution.paths.dataRoot);
    try {
      await fs.mkdir(path.dirname(file), { mode: 0o700 }).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
      const directory = await fs.lstat(path.dirname(file));
      if (
        !directory.isDirectory() ||
        directory.isSymbolicLink() ||
        directory.mode & 0o077 ||
        (process.getuid && directory.uid !== process.getuid())
      ) {
        await this.lease.release();
        this.lease = undefined;
        throw new ExecutionError('EXECUTION_SOCKET_UNSAFE');
      }
      const existing = await fs.lstat(file).catch((error) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (existing) {
        if (
          !existing.isSocket() ||
          (process.getuid && existing.uid !== process.getuid())
        )
          throw new ExecutionError('EXECUTION_SOCKET_UNSAFE');
        await fs.unlink(file);
      }
      const server = net.createServer((socket) => {
        socket.setTimeout(5000, () => socket.destroy());
        let text = '',
          accepted = false;
        socket.on('error', () => {});
        socket.on('data', (chunk) => {
          if (accepted) {
            socket.destroy();
            return;
          }
          text += chunk.toString('utf8');
          if (text.length > 64) {
            socket.destroy();
            return;
          }
          if (!text.endsWith('\n')) return;
          accepted = true;
          if (
            !/^[1-9]\d*\n$/.test(text) ||
            !Number.isSafeInteger(Number(text.trim()))
          ) {
            socket.end('INVALID\n');
            return;
          }
          if (this.queuedSubmissions >= 128) {
            socket.end('BUSY\n');
            return;
          }
          this.queuedSubmissions++;
          this.submissions = this.submissions.then(async () => {
            try {
              if (socket.destroyed) return;
              const run = await this.execution.submit(Number(text.trim()), 'SCHEDULE');
              socket.end(JSON.stringify({ id: run.id, status: run.status }) + '\n');
            } catch {
              socket.end('FAILED\n');
            } finally {
              this.queuedSubmissions--;
            }
          });
        });
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(file, resolve);
      });
      this.server = server;
      await fs.chmod(file, 0o600);
      server.unref();
    } catch (error) {
      if (this.server)
        await new Promise<void>((resolve) =>
          this.server!.close(() => resolve()),
        );
      this.server = undefined;
      await this.lease?.release();
      this.lease = undefined;
      throw error;
    }
  }
  async stop() {
    if (this.server)
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
    await this.lease?.release();
    this.lease = undefined;
    this.starting = undefined;
  }
}
export const executionSubmission = new ExecutionSubmissionServer(
  executionService,
);
