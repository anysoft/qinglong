import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import readline from 'readline';
import path from 'path';
import config from '../config';
import { RepositoryPathResolver } from '../shared/workspacePaths';
import { WorkspaceError } from '../shared/workspaceError';
export interface LockOwner {
  owner_type: string;
  owner_id: string;
  operation: string;
}
export class WorkspaceGuard {
  private pending?: {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  };
  private ended = false;
  readonly closed: Promise<void>;
  constructor(private child: ChildProcessWithoutNullStreams) {
    this.closed = new Promise((resolve) =>
      child.once('close', () => {
        this.ended = true;
        this.pending?.reject(new WorkspaceError('WORKSPACE_HELPER_FAILED'));
        resolve();
      }),
    );
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const data = JSON.parse(line);
        this.pending?.resolve(data);
        this.pending = undefined;
      } catch {
        this.pending?.reject(new WorkspaceError('WORKSPACE_HELPER_FAILED'));
      }
    });
    child.on('error', () =>
      this.pending?.reject(
        new WorkspaceError(
          'WORKSPACE_HELPER_FAILED',
          'Python 3 POSIX lock helper could not start',
          503,
        ),
      ),
    );
    child.stdin.on('error', () =>
      this.pending?.reject(new WorkspaceError('WORKSPACE_HELPER_FAILED')),
    );
    child.stderr.resume();
  }
  receive() {
    return new Promise<any>((resolve, reject) => {
      if (this.ended)
        return reject(new WorkspaceError('WORKSPACE_HELPER_FAILED'));
      this.pending = { resolve, reject };
    });
  }
  async run(
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeout: number,
    program: 'git' | 'bash' = 'git',
  ) {
    const response = this.receive();
    this.child.stdin.write(
      JSON.stringify({ args, cwd, env, timeout, program }) + '\n',
    );
    const result = await response;
    if (result.error) throw new WorkspaceError('WORKSPACE_HELPER_FAILED');
    return result as { code: number; stdout: string; stderr: string };
  }
  async release() {
    if (!this.ended) this.child.stdin.end();
    await this.closed;
  }
}
export class WorkspaceLocks {
  constructor(
    private paths: RepositoryPathResolver,
    private helper = path.join(config.rootPath, 'shell/git_workspace_lock.py'),
  ) {}
  async acquire(
    resources: {
      kind: 'repository' | 'worktree' | 'subscription' | 'publication';
      id: number;
    }[],
    owner: LockOwner,
    probe = false,
  ) {
    const files = await Promise.all(
      resources.map((r) => this.paths.lock(r.kind, r.id)),
    );
    const guard = new WorkspaceGuard(
      spawn(
        'python3',
        [
          '-I',
          '-S',
          this.helper,
          JSON.stringify(files),
          JSON.stringify({ ...owner, probe }),
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      ),
    );
    const result = await guard.receive();
    if (result.busy || probe || result.error) {
      await guard.release();
      if (probe) return result;
      if (result.busy)
        throw new WorkspaceError(
          result.path?.includes('worktree-')
            ? 'WORKTREE_BUSY'
            : 'REPOSITORY_BUSY',
        );
      throw new WorkspaceError('WORKSPACE_HELPER_FAILED');
    }
    return guard;
  }
  async with<T>(
    resources: {
      kind: 'repository' | 'worktree' | 'subscription' | 'publication';
      id: number;
    }[],
    operation: string,
    action: (guard: WorkspaceGuard) => Promise<T>,
  ) {
    const guard = (await this.acquire(resources, {
      owner_type: 'workspace',
      owner_id: String(process.pid),
      operation,
    })) as WorkspaceGuard;
    try {
      return await action(guard);
    } finally {
      await guard.release();
    }
  }
  async probe(
    kind: 'repository' | 'worktree' | 'subscription' | 'publication',
    id: number,
  ) {
    return this.acquire(
      [{ kind, id }],
      { owner_type: 'probe', owner_id: '', operation: 'status' },
      true,
    );
  }
}
