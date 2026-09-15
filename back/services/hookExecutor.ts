import {
  spawn,
  ChildProcessWithoutNullStreams,
  SpawnOptionsWithoutStdio,
} from 'child_process';
import path from 'path';
import config from '../config';
import { observeChildProcess } from '../shared/childProcess';

/** Streaming process supervision is shared by hook phases and the current MAIN bridge. */
export default class HookExecutor {
  private active?: ChildProcessWithoutNullStreams;
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
    const fds = (process.env.PLATFORM_LEASE_FDS ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    const stdio: any[] = ['pipe', 'pipe', 'pipe'];
    for (const fd of fds) stdio[fd] = fd;
    const child = spawn(
      'python3',
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
          ...(fds.length ? { PLATFORM_LEASE_FDS: fds.join(',') } : {}),
        },
        stdio,
      },
    ) as ChildProcessWithoutNullStreams;
    this.active = child;
    try {
      const result = await observeChildProcess(child, {
        onStdout: onOutput,
        onStderr: onOutput,
      }).completed;
      return {
        code: result.error ? 1 : result.code ?? 1,
        reason:
          result.code === 124
            ? 'TIMEOUT'
            : result.code === 143
            ? 'CANCELLED'
            : result.error
            ? 'SPAWN_FAILED'
            : result.code === 0
            ? 'SUCCESS'
            : 'EXIT_NONZERO',
      };
    } finally {
      if (this.active === child) this.active = undefined;
    }
  }
}
