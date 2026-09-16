import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import RuntimePathResolver from './runtimePaths';
import { RuntimeLease } from './runtimeProcess';
import { ExecutionError } from '../shared/execution';
import { MaterializationLease } from './configMaterialization';

/** Uses the exact Worktree lock inode used by repository operations. */
export default class ExecutionPaths extends RuntimePathResolver {
  constructor(
    dataRoot?: string,
    private kind: 'worktree' | 'execution' = 'execution',
  ) {
    super(dataRoot);
  }
  async lock(id: number) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ExecutionError('EXECUTION_ID_INVALID');
    return path.join(
      await this.directory('.locks', true),
      `${this.kind}-${id}.lock`,
    );
  }
  async owner(id: number) {
    return RuntimeLease.acquire(this, id);
  }
  async worktree(id: number) {
    return RuntimeLease.acquire(
      new ExecutionPaths(this.dataRoot, 'worktree'),
      id,
    );
  }
  resourceKey(id: number) {
    return createHash('sha256').update(`worktree:${id}`).digest('hex');
  }
  materializationLease(id: number, lease: RuntimeLease): MaterializationLease {
    return {
      resourceKey: this.resourceKey(id),
      exclusive: true,
      processLeaseFds: [lease.handle.fd],
      async assertHeld() {
        await lease.handle.stat();
      },
    };
  }
  async runDirectory(id: number) {
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ExecutionError('EXECUTION_ID_INVALID');
    return this.directory(`tmp/execution/run-${id}`, true);
  }
  async attemptDirectory(id: number, attempt: number) {
    if (!Number.isSafeInteger(attempt) || attempt < 1)
      throw new ExecutionError('EXECUTION_ID_INVALID');
    const directory = path.join(
      await this.runDirectory(id),
      `attempt-${attempt}`,
    );
    await fs.mkdir(directory, { mode: 0o700 });
    const identity = await fs.lstat(directory);
    await this.privateWrite(
      path.join(directory, '.owner.json'),
      JSON.stringify({
        runId: id,
        attempt,
        ino: identity.ino,
        dev: identity.dev,
      }),
    );
    return directory;
  }
  /** Called only while holding this run's owner EX lease. Unknown files survive. */
  async cleanupRunDirectory(id: number) {
    let root: string;
    try {
      root = await this.directory(`tmp/execution/run-${id}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const name of await fs.readdir(root)) {
      if (!/^attempt-[1-9]\d*$/.test(name))
        throw new ExecutionError('EXECUTION_TEMP_RECOVERY_REQUIRED');
      const directory = await this.directory(`tmp/execution/run-${id}/${name}`);
      const names = await fs.readdir(directory);
      if (!names.length) {
        await fs.rmdir(directory);
        continue;
      }
      const identity = await fs.lstat(directory);
      const marker = await this.readJson(path.join(directory, '.owner.json'));
      if (
        marker.runId !== id ||
        `attempt-${marker.attempt}` !== name ||
        marker.ino !== identity.ino ||
        marker.dev !== identity.dev
      )
        throw new ExecutionError('EXECUTION_TEMP_RECOVERY_REQUIRED');
      for (const file of names) {
        if (file === '.owner.json') continue;
        if (!/^hook-[1-9]\d*\.(?:json|sh)$/.test(file))
          throw new ExecutionError('EXECUTION_TEMP_RECOVERY_REQUIRED');
        const target = path.join(directory, file),
          info = await fs.lstat(target);
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
          throw new ExecutionError('EXECUTION_TEMP_RECOVERY_REQUIRED');
        await fs.unlink(target);
      }
      await fs.unlink(path.join(directory, '.owner.json'));
      await fs.rmdir(directory);
    }
    await fs.rmdir(root);
  }
}
