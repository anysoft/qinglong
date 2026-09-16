import {
  spawn,
  ChildProcessWithoutNullStreams,
  SpawnOptionsWithoutStdio,
} from 'child_process';
import path from 'path';
import { inheritedLeaseFds } from './backup/inheritedLeases';
import config from '../config';
import { observeChildProcess } from '../shared/childProcess';

/** Streaming process supervision is shared by hook phases and the current MAIN bridge. */
export default class HookExecutor {
  private active?: ChildProcessWithoutNullStreams;
  constructor(private leaseFds?: readonly number[]) {}
  cancel() {
    this.active?.kill('SIGTERM');
  }
  async run(
    program: string,
    args: string[],
    cwd: string,
    environment: NodeJS.ProcessEnv,
    timeoutSeconds: number,
    onOutput: (chunk: string) => Promise<void>,
  ) {
    const fds = this.leaseFds
      ? [...this.leaseFds]
      : (process.env.PLATFORM_LEASE_FDS ?? '')
          .split(',')
          .filter(Boolean)
          .map(Number);
    fds.push(...inheritedLeaseFds().filter(fd=>!fds.includes(fd)));
    const stdio: any[] = ['pipe', 'pipe', 'pipe'];
    for (const fd of fds) stdio.push(fd);
    const resultFd = stdio.length;
    stdio.push('pipe');
    const child = spawn(
      '/usr/bin/python3',
      [
        '-I',
        '-S',
        path.join(config.rootPath, 'shell/hook_process.py'),
        String(timeoutSeconds),
        program,
        ...args,
      ],
      {
        cwd,
        env: {
          ...environment,
          PLATFORM_PROCESS_RESULT_FD: String(resultFd),
          ...(fds.length
            ? { PLATFORM_LEASE_FDS: fds.map((_, index) => index + 3).join(',') }
            : {}),
        },
        stdio,
      },
    ) as ChildProcessWithoutNullStreams;
    this.active = child;
    let report = '';
    const resultPipe = child.stdio[resultFd] as import('stream').Readable;
    resultPipe.setEncoding('utf8');
    resultPipe.on('data', (chunk) => {
      if (report.length < 4096) report += chunk;
    });
    let pending = Promise.resolve();
    const output = (chunk: string) => {
      pending = pending
        .then(() => onOutput(chunk))
        .catch((error) => {
          child.kill('SIGTERM');
          throw error;
        });
      return pending;
    };
    try {
      const result = await observeChildProcess(child, {
        onStdout: output,
        onStderr: output,
      }).completed;
      let outcome: {
        reason?: string;
        exitCode?: number | null;
        signal?: NodeJS.Signals | null;
      } = {};
      try {
        outcome = JSON.parse(report);
      } catch {}
      return {
        exitCode: outcome.exitCode ?? null,
        code: result.error ? 1 : result.code ?? 1,
        signal: outcome.signal ?? result.signal,
        reason:
          outcome.reason ??
          (result.code === 124
            ? 'TIMEOUT'
            : result.code === 143
            ? 'CANCELLED'
            : result.error
            ? 'SPAWN_FAILED'
            : result.code === 0
            ? 'SUCCESS'
            : 'EXIT_NONZERO'),
      };
    } finally {
      if (this.active === child) this.active = undefined;
    }
  }
}
