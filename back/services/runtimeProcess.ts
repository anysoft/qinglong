import { inheritedLeaseFds } from './backup/inheritedLeases';
import fs, { FileHandle } from 'fs/promises';
import { constants } from 'fs';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import config from '../config';
import { observeChildProcess } from '../shared/childProcess';
import { RuntimeError, RUNTIME_TOOL_PATH } from '../shared/runtime';
import RuntimePathResolver from './runtimePaths';

export class RuntimeLease {
  private closed = false;
  private constructor(readonly handle: FileHandle) {}
  static async acquire(
    paths: RuntimePathResolver,
    provider: number,
    mode: 'exclusive' | 'shared' = 'exclusive',
  ) {
    const handle = await fs.open(
      await paths.lock(provider),
      constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || (process.getuid && stat.uid !== process.getuid()))
        throw new RuntimeError('RUNTIME_PATH_INVALID');
      const child = spawn(
        '/usr/bin/python3',
        [
          '-I',
          '-S',
          path.join(config.rootPath, 'shell/runtime_lease.py'),
          mode,
        ],
        {
          env: { PATH: RUNTIME_TOOL_PATH },
          stdio: ['pipe', 'pipe', 'pipe', handle.fd],
        },
      ) as ChildProcessWithoutNullStreams;
      child.stdin.end();
      const result = await observeChildProcess(child).completed;
      if (result.error || result.code !== 0)
        throw new RuntimeError(
          result.code === 75 ? 'RUNTIME_BUSY' : 'RUNTIME_LOCK_FAILED',
        );
      return new RuntimeLease(handle);
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async release() {
    if (!this.closed) {
      this.closed = true;
      await this.handle.close();
    }
  }
}

/** Resource operation processes reuse the existing UTF-8/drain and POSIX supervisor.
 * No Task, Hook plan, Scoped ENV, Config lease or stored PID is consulted. */
export class RuntimeCommand {
  private child?: ChildProcessWithoutNullStreams;
  private cancelled = false;
  private deadline: number;
  constructor(
    private lease: RuntimeLease,
    timeout: number,
    private output: (text: string) => Promise<void>,
    private resourceLeases: RuntimeLease[] = [],
  ) {
    this.deadline = Date.now() + timeout * 1000;
  }
  cancel() {
    this.cancelled = true;
    this.child?.kill('SIGTERM');
  }
  async run(
    program: string,
    args: string[],
    cwd: string,
    environment: NodeJS.ProcessEnv,
    capture = false,
  ) {
    if (this.cancelled) throw new RuntimeError('RUNTIME_CANCELLED');
    const remaining = (this.deadline - Date.now()) / 1000;
    if (remaining <= 0) throw new RuntimeError('RUNTIME_TIMEOUT');
    const fds = [...new Set([this.lease.handle.fd, ...this.resourceLeases.map(x => x.handle.fd), ...inheritedLeaseFds()])];
    const child = spawn(
      '/usr/bin/python3',
      [
        '-I',
        '-S',
        path.join(config.rootPath, 'shell/hook_process.py'),
        String(remaining),
        program,
        ...args,
      ],
      {
        cwd,
        env: { ...environment, PLATFORM_LEASE_FDS: fds.map((_, i) => String(i + 3)).join(',') },
        stdio: ['pipe', 'pipe', 'pipe', ...fds],
      },
    ) as ChildProcessWithoutNullStreams;
    this.child = child;
    let stdout = '',
      failure: string | undefined;
    const append = async (text: string, isStdout: boolean) => {
      if (capture && isStdout && !failure) {
        if (Buffer.byteLength(stdout) + Buffer.byteLength(text) > 1024 * 1024) {
          failure = 'RUNTIME_OUTPUT_LIMIT';
          child.kill('SIGTERM');
        } else stdout += text;
      }
      try {
        await this.output(text);
      } catch {
        failure = 'RUNTIME_LOG_FAILED';
        child.kill('SIGTERM');
        throw new RuntimeError(failure);
      }
    };
    try {
      const result = await observeChildProcess(child, {
        onStdout: (text) => append(text, true),
        onStderr: (text) => append(text, false),
      }).completed;
      if (failure) throw new RuntimeError(failure);
      if (this.cancelled) throw new RuntimeError('RUNTIME_CANCELLED');
      if (result.code === 124) throw new RuntimeError('RUNTIME_TIMEOUT');
      if (result.error) throw new RuntimeError('RUNTIME_PROCESS_FAILED');
      if (result.code !== 0)
        throw new RuntimeError('RUNTIME_COMMAND_FAILED', 409, result.code ?? 1);
      return stdout;
    } finally {
      this.child = undefined;
    }
  }
}
