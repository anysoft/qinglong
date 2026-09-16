import fs from 'fs/promises';
import path from 'path';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import RuntimePathResolver from '../runtimePaths';
import { RuntimeLease } from '../runtimeProcess';
import {
  BackupError,
  fail,
  privateDirectory,
  privateJson,
  readJson,
  syncDirectory,
} from './files';

class BarrierPaths extends RuntimePathResolver {
  async lock(id: number) {
    if (![1, 2].includes(id)) fail('BACKUP_PATH_INVALID');
    return path.join(
      await privateDirectory(this.dataRoot),
      id === 1 ? 'backup.lock' : 'mutation.lock',
    );
  }
}
export type BarrierPhase = 'QUIESCING' | 'SNAPSHOTTING' | 'RESTORE_PENDING';
export interface BarrierState {
  version: 1;
  id: string;
  phase: BarrierPhase;
}
/** Cross-process admission gate. Control directory must be outside the swappable DATA_DIR.
 * Existing queue owners may drain during QUIESCING; producers must use mutation().
 * Every asynchronous operation must retain mutation() until its final writes finish.
 */
export class PlatformBackupBarrier {
  private readonly context = new AsyncLocalStorage<boolean>();
  private readonly paths: BarrierPaths;
  constructor(readonly controlRoot: string) {
    this.paths = new BarrierPaths(controlRoot);
  }
  private get marker() {
    return path.join(this.controlRoot, 'barrier.json');
  }
  async state(): Promise<BarrierState | null> {
    await privateDirectory(this.controlRoot);
    const state = await readJson(this.marker).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if (
      state &&
      (state.version !== 1 ||
        !/^[0-9a-f-]{36}$/.test(state.id) ||
        !['QUIESCING', 'SNAPSHOTTING', 'RESTORE_PENDING'].includes(state.phase))
    )
      fail('BACKUP_RECOVERY_REQUIRED');
    return state;
  }
  private async acquire(id: number, mode: 'shared' | 'exclusive') {
    try {
      return await RuntimeLease.acquire(this.paths, id, mode);
    } catch (e) {
      if ((e as any).error_code === 'RUNTIME_BUSY')
        throw new BackupError('PLATFORM_BACKUP_IN_PROGRESS');
      throw e;
    }
  }
  async mutation<T>(action: () => Promise<T>, drain = false): Promise<T> {
    if (this.context.getStore()) return action();
    const lease = await this.acquire(2, 'shared');
    try {
      const state = await this.state();
      if (state && !(drain && state.phase === 'QUIESCING'))
        fail('PLATFORM_BACKUP_IN_PROGRESS');
      return await this.context.run(true, action);
    } finally {
      await lease.release();
    }
  }
  async snapshot<T>(
    idle: () => Promise<boolean>,
    action: () => Promise<T>,
    timeoutMs = 600000,
  ) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3600000)
      fail('BACKUP_TIMEOUT_INVALID');
    const owner = await this.acquire(1, 'exclusive');
    let freeze: RuntimeLease | undefined,
      published = false;
    const id = randomUUID(),
      deadline = Date.now() + timeoutMs;
    try {
      if (await this.state()) fail('BACKUP_RECOVERY_REQUIRED');
      await privateJson(this.marker, { version: 1, id, phase: 'QUIESCING' });
      published = true;
      while (true) {
        if (Date.now() >= deadline) fail('BACKUP_BUSY');
        if (await idle()) {
          try {
            freeze = await this.acquire(2, 'exclusive');
          } catch (e) {
            if (
              !(e instanceof BackupError) ||
              e.code !== 'PLATFORM_BACKUP_IN_PROGRESS'
            )
              throw e;
          }
          if (freeze) {
            // Recheck after locking: the first read was only a hint, not a safe point.
            if (await idle()) break;
            await freeze.release();
            freeze = undefined;
          }
        }
        await new Promise((r) =>
          setTimeout(r, Math.min(25, Math.max(1, deadline - Date.now()))),
        );
      }
      await privateJson(this.marker, { version: 1, id, phase: 'SNAPSHOTTING' });
      return await action();
    } finally {
      // Failed work never resumes producers before the exclusive snapshot handle releases.
      try {
        if (published) {
          await fs.unlink(this.marker);
          await syncDirectory(this.controlRoot);
        }
      } finally {
        try {
          await freeze?.release();
        } finally {
          await owner.release();
        }
      }
    }
  }
  /** Startup only. Exclusive admission proves no cooperating operation is active.
   * A restore pending journal belongs to RestoreBootstrap and is never cleared here.
   */
  async recoverAbandonedSnapshot() {
    const owner = await this.acquire(1, 'exclusive');
    let freeze: RuntimeLease | undefined;
    try {
      freeze = await this.acquire(2, 'exclusive');
      const state = await this.state();
      if (state?.phase === 'RESTORE_PENDING') fail('RESTORE_PENDING');
      if (state) {
        await fs.unlink(this.marker);
        await syncDirectory(this.controlRoot);
      }
    } finally {
      await freeze?.release();
      await owner.release();
    }
  }
}
