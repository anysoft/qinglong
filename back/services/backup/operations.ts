import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { BackupPaths, backupId } from './paths';
import { fail, privateJson, readJson } from './files';
import RuntimePathResolver from '../runtimePaths';
import { RuntimeLease } from '../runtimeProcess';
class OperationPaths extends RuntimePathResolver {
  async lock() {
    return path.join(this.dataRoot, 'operation.lock');
  }
}
export class BackupOperations {
  constructor(readonly paths: BackupPaths) {}
  async exclusive<T>(action: () => Promise<T>) {
    await this.paths.initialize();
    let lease: RuntimeLease;
    try {
      lease = await RuntimeLease.acquire(
        new OperationPaths(this.paths.control),
        1,
      );
    } catch {
      fail('BACKUP_OPERATION_BUSY');
    }
    try {
      return await action();
    } finally {
      await lease!.release();
    }
  }
  async start(
    kind: string,
    action: (progress: {
      processed_bytes: number;
      processed_files: number;
    }) => Promise<unknown>,
  ) {
    await this.paths.initialize();
    let lease: RuntimeLease;
    try {
      lease = await RuntimeLease.acquire(
        new OperationPaths(this.paths.control),
        1,
      );
    } catch {
      fail('BACKUP_OPERATION_BUSY');
    }
    const id = randomUUID(),
      file = await this.paths.bucket('operations', id),
      progress = { processed_bytes: 0, processed_files: 0 };
    const state: any = {
      id,
      kind,
      status: 'QUEUED',
      phase: kind,
      created_at: new Date().toISOString(),
      ...progress,
    };
    try {
      await privateJson(file, state);
    } catch (e) {
      await lease!.release();
      throw e;
    }
    setImmediate(() => {
      void (async () => {
        let timer: NodeJS.Timeout | undefined;
        let pending = Promise.resolve();
        try {
          state.status = 'RUNNING';
          await privateJson(file, state);
          timer = setInterval(() => {
            const update = { ...state, ...progress };
            pending = pending
              .then(() => privateJson(file, update))
              .catch(() => {});
          }, 1000);
          state.result = await action(progress);
          state.status = 'SUCCESS';
        } catch (e) {
          state.status = 'FAILED';
          const code = (e as any).code || (e as Error).message;
          state.error_code = /^(?:BACKUP|RESTORE|PLATFORM)_[A-Z_]+$/.test(code)
            ? code
            : 'BACKUP_OPERATION_FAILED';
        } finally {
          if (timer) clearInterval(timer);
          await pending;
          Object.assign(state, progress);
          state.finished_at = new Date().toISOString();
          await privateJson(file, state).finally(() => lease!.release());
        }
      })().catch(() => {});
    });
    return { id, status: 'QUEUED' };
  }
  async get(id: string) {
    return readJson(await this.paths.bucket('operations', backupId(id)));
  }
  async recover() {
    await this.exclusive(async () => {
      for await (const e of await fs.opendir(
        await this.paths.bucket('operations'),
      )) {
        if (!e.isFile()) continue;
        try {
          const file = await this.paths.bucket('operations', e.name),
            state = await readJson(file);
          if (['QUEUED', 'RUNNING'].includes(state.status)) {
            state.status = 'FAILED';
            state.error_code = 'BACKUP_OPERATION_INTERRUPTED';
            await privateJson(file, state);
          }
        } catch {
          /* preserve unknown files */
        }
      }
    });
  }
}
