import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import config from '../../config';
import { BackupCoordinator } from './coordinator';
import { BackupPaths, backupId, acquireBackendLease } from './paths';
import {
  fail,
  privateDirectory,
  privateJson,
  readJson,
  sha256,
  hashFile,
  syncDirectory,
} from './files';
import { copyInventory, validateInventory } from './inventory';
import { BackupRestoreGitRepairService } from './git';
import { RuntimeRestoreReconciler } from './runtimeRestore';
import { backupDatabase } from './sqlite';
export type RestoreStage =
  | 'PENDING'
  | 'PREPARING'
  | 'PREPARED'
  | 'OLD_ROOT_MOVED'
  | 'CANDIDATE_PUBLISHED'
  | 'VALIDATING'
  | 'COMPLETE'
  | 'ROLLED_BACK'
  | 'CANCELLED';
interface RestoreJournal {
  version: 1;
  operation_id: string;
  snapshot_id: string;
  source: 'snapshots' | 'imports';
  manifest_hash: string;
  target: string;
  candidate: string;
  old_root: string;
  stage: RestoreStage;
  created_at: string;
  updated_at: string;
  candidate_identity?: { dev: number; ino: number };
  old_identity?: { dev: number; ino: number };
  old_empty?: boolean;
  safety_snapshot?: string;
  rebuild_plan?: unknown;
}
export class RestoreService {
  readonly backup: BackupCoordinator;
  constructor(
    readonly paths = new BackupPaths(),
    readonly fault: (point: string) => Promise<void> = async () => {},
  ) {
    this.backup = new BackupCoordinator(paths);
  }
  private get journalFile() {
    return path.join(this.paths.control, 'restore-journal.json');
  }
  private async write(journal: RestoreJournal) {
    journal.updated_at = new Date().toISOString();
    await privateJson(this.journalFile, {
      journal,
      checksum: sha256(JSON.stringify(journal)),
    });
  }
  async journal(): Promise<RestoreJournal | null> {
    await this.paths.initialize();
    const value = await readJson(this.journalFile).catch((e) => {
      if (e.code === 'ENOENT') return null;
      return fail('RESTORE_JOURNAL_INVALID');
    });
    if (!value) return null;
    const j = value.journal;
    if (
      !j ||
      value.checksum !== sha256(JSON.stringify(j)) ||
      j.version !== 1 ||
      !['snapshots', 'imports'].includes(j.source) ||
      ![
        'PENDING',
        'PREPARING',
        'PREPARED',
        'OLD_ROOT_MOVED',
        'CANDIDATE_PUBLISHED',
        'VALIDATING',
        'COMPLETE',
        'ROLLED_BACK',
        'CANCELLED',
      ].includes(j.stage)
    )
      fail('RESTORE_JOURNAL_INVALID');
    backupId(j.operation_id);
    backupId(j.snapshot_id);
    if (
      j.target !== this.paths.data ||
      j.candidate !==
        path.join(this.paths.control, 'candidates', j.operation_id) ||
      j.old_root !== path.join(this.paths.control, 'quarantine', j.operation_id)
    )
      fail('RESTORE_JOURNAL_INVALID');
    return j;
  }
  async status() {
    const j = await this.journal();
    return j
      ? {
          id: j.operation_id,
          snapshot_id: j.snapshot_id,
          stage: j.stage,
          restart_required: j.stage === 'PENDING',
          rebuild_plan:
            j.stage === 'COMPLETE'
              ? await new RuntimeRestoreReconciler().plan(this.paths.data)
              : j.rebuild_plan ?? null,
        }
      : null;
  }
  private async source(j: RestoreJournal) {
    const root = await this.paths.bucket(j.source, j.snapshot_id);
    await this.paths.assertOwned(root, j.snapshot_id);
    return j.source === 'imports' ? path.join(root, 'snapshot') : root;
  }
  async stage(
    id: string,
    source: 'snapshots' | 'imports' = 'snapshots',
    offline = false,
  ) {
    await this.paths.initialize();
    const previous = await this.journal();
    if (
      previous &&
      !['COMPLETE', 'ROLLED_BACK', 'CANCELLED'].includes(previous.stage)
    )
      fail('RESTORE_ALREADY_PENDING');
    const operation_id = randomUUID();
    const j: RestoreJournal = {
      version: 1,
      operation_id,
      snapshot_id: backupId(id),
      source,
      manifest_hash: '',
      target: this.paths.data,
      candidate: path.join(this.paths.control, 'candidates', operation_id),
      old_root: path.join(this.paths.control, 'quarantine', operation_id),
      stage: 'PENDING',
      created_at: new Date().toISOString(),
      updated_at: '',
    };
    const snapshot = await this.source(j);
    await this.backup.validator.validate(snapshot);
    j.manifest_hash = (
      await hashFile(path.join(snapshot, 'manifest.json'))
    ).sha256;
    const publish = async () => {
      await this.write(j);
      try {
        await privateJson(path.join(this.paths.control, 'barrier.json'), {
          version: 1,
          id: operation_id,
          phase: 'RESTORE_PENDING',
        });
      } catch (e) {
        await fs.unlink(this.journalFile);
        await syncDirectory(this.paths.control);
        throw e;
      }
    };
    if (offline) {
      const lease = await acquireBackendLease(this.paths);
      try {
        if (
          (await this.identity(this.paths.data)) &&
          !(await this.empty(this.paths.data)) &&
          !(await this.backup.idle())
        )
          fail('BACKUP_BUSY');
        await publish();
      } finally {
        await lease!.release();
      }
    } else
      await this.backup.barrier.snapshot(() => this.backup.idle(), publish);
    return this.status();
  }
  async cancel() {
    const j = await this.journal();
    if (!j || j.stage !== 'PENDING') return fail('RESTORE_CANCEL_UNAVAILABLE');
    j.stage = 'CANCELLED';
    await this.write(j);
    await fs.unlink(path.join(this.paths.control, 'barrier.json'));
    await syncDirectory(this.paths.control);
    if (j.source === 'imports')
      await this.paths.remove('imports', j.snapshot_id);
    return { cancelled: true };
  }
  private async migrate(root: string) {
    const compiled = path.join(
      config.rootPath,
      'static/build/backupCandidate.js',
    );
    const args = await fs.lstat(compiled).then(
      () => [compiled],
      () => [
        '-r',
        require.resolve('ts-node/register/transpile-only'),
        path.join(config.rootPath, 'back/backupCandidate.ts'),
      ],
    );
    await new Promise<void>((resolve, reject) =>
      execFile(
        process.execPath,
        args,
        {
          env: {
            ...process.env,
            QL_DATA_DIR: root,
            TS_NODE_PROJECT: path.join(config.rootPath, 'back/tsconfig.json'),
          },
          timeout: 120000,
          maxBuffer: 1024 * 1024,
        },
        (err) =>
          err
            ? reject(new Error('RESTORE_SCHEMA_MIGRATION_FAILED'))
            : resolve(),
      ),
    );
  }
  private async identity(file: string) {
    const stat = await fs.lstat(file).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if (!stat) return null;
    if (!stat.isDirectory() || stat.isSymbolicLink())
      fail('RESTORE_RECOVERY_REQUIRED');
    return { dev: stat.dev, ino: stat.ino };
  }
  private async empty(root: string) {
    for await (const _entry of await fs.opendir(root)) return false;
    return true;
  }
  private same(a: any, b: any) {
    return a && b && a.dev === b.dev && a.ino === b.ino;
  }
  async apply(leaseHeld = false) {
    const lease = leaseHeld ? null : await acquireBackendLease(this.paths);
    try {
      let j = await this.journal();
      if (!j) return this.status();
      if (
        j.stage === 'COMPLETE' ||
        j.stage === 'ROLLED_BACK' ||
        j.stage === 'CANCELLED'
      ) {
        const marker = await this.backup.barrier.state();
        if (
          marker?.phase === 'RESTORE_PENDING' &&
          marker.id === j.operation_id
        ) {
          await fs.unlink(path.join(this.paths.control, 'barrier.json'));
          await syncDirectory(this.paths.control);
        }
        return this.status();
      }
      if (
        j.stage === 'VALIDATING' &&
        j.old_identity &&
        this.same(await this.identity(j.target), j.old_identity) &&
        !(await this.identity(j.old_root)) &&
        this.same(
          await this.identity(
            path.join(this.paths.control, 'failed', j.operation_id),
          ),
          j.candidate_identity,
        )
      ) {
        j.stage = 'ROLLED_BACK';
        await this.write(j);
        fail('RESTORE_RECOVERY_REQUIRED');
      }
      // Recover a crash between the two rollback renames by proving both inode identities.
      if (
        j.stage === 'VALIDATING' &&
        j.old_identity &&
        !(await this.identity(j.target)) &&
        this.same(
          await this.identity(
            path.join(this.paths.control, 'failed', j.operation_id),
          ),
          j.candidate_identity,
        ) &&
        this.same(await this.identity(j.old_root), j.old_identity)
      ) {
        await fs.rename(j.old_root, j.target);
        await syncDirectory(path.dirname(j.target));
        j.stage = 'ROLLED_BACK';
        await this.write(j);
        fail('RESTORE_RECOVERY_REQUIRED');
      }
      const snapshot = await this.source(j);
      await this.backup.validator.validate(snapshot);
      if (
        (await hashFile(path.join(snapshot, 'manifest.json'))).sha256 !==
        j.manifest_hash
      )
        fail('RESTORE_MANIFEST_CHANGED');
      for (const dir of ['candidates', 'quarantine', 'failed'])
        await privateDirectory(path.join(this.paths.control, dir), true);
      if (j.stage === 'PENDING' || j.stage === 'PREPARING') {
        // A pre-switch crash may discard only this journal-owned candidate inode.
        const previous = await this.identity(j.candidate);
        if (previous) {
          if (!this.same(previous, j.candidate_identity))
            fail('RESTORE_RECOVERY_REQUIRED');
          await fs.rm(j.candidate, { recursive: true });
        }
        await fs.mkdir(j.candidate, { mode: 0o700 });
        j.candidate_identity = (await this.identity(j.candidate))!;
        j.stage = 'PREPARING';
        await this.write(j);
        await fs
          .unlink(
            path.join(
              this.paths.control,
              'candidate-copy-' + j.operation_id + '.ndjson',
            ),
          )
          .catch((e) => {
            if (e.code !== 'ENOENT') throw e;
          });
        await copyInventory(
          path.join(snapshot, 'data'),
          j.candidate,
          path.join(
            this.paths.control,
            'candidate-copy-' + j.operation_id + '.ndjson',
          ),
          () => false,
          { processed_bytes: 0, processed_files: 0 },
        );
        await this.fault('during-schema-migration');
        await this.migrate(j.candidate);
        await this.fault('during-git-repair');
        await new BackupRestoreGitRepairService().verify(j.candidate, true);
        j.rebuild_plan = await new RuntimeRestoreReconciler().reconcile(
          j.candidate,
        );
        await this.backup.validator.domains(j.candidate);
        // Files copied from snapshot are private; restore user executable modes after validation.
        for await (const row of (await import('./inventory')).inventoryLines(
          path.join(snapshot, 'inventory.ndjson'),
        ))
          if (row.kind !== 'symlink')
            await fs.chmod(path.join(j.candidate, row.path), row.mode);
        j.old_identity = (await this.identity(this.paths.data)) ?? undefined;
        if (j.old_identity) {
          if (j.old_identity.dev !== j.candidate_identity.dev)
            fail('RESTORE_ATOMIC_SWITCH_UNAVAILABLE');
          j.old_empty = await this.empty(this.paths.data);
          if (!j.old_empty)
            j.safety_snapshot = await this.backup.create(
              600000,
              undefined,
              true,
            );
        }
        j.stage = 'PREPARED';
        await this.write(j);
        await this.fault('after-candidate-validation');
      }
      if (j.stage === 'PREPARED') {
        if (!this.same(await this.identity(j.candidate), j.candidate_identity))
          fail('RESTORE_RECOVERY_REQUIRED');
        const live = await this.identity(j.target),
          old = await this.identity(j.old_root);
        if (j.old_identity) {
          if (this.same(live, j.old_identity) && !old) {
            await fs.rename(j.target, j.old_root);
            await syncDirectory(path.dirname(j.target));
            await syncDirectory(path.dirname(j.old_root));
          } else if (!live && this.same(old, j.old_identity)) {
          } else fail('RESTORE_RECOVERY_REQUIRED');
        } else if (live) fail('RESTORE_RECOVERY_REQUIRED');
        await this.fault('after-old-rename');
        j.stage = 'OLD_ROOT_MOVED';
        await this.write(j);
      }
      if (j.stage === 'OLD_ROOT_MOVED') {
        const live = await this.identity(j.target),
          candidate = await this.identity(j.candidate);
        if (!live && this.same(candidate, j.candidate_identity)) {
          await fs.rename(j.candidate, j.target);
          await syncDirectory(path.dirname(j.target));
        } else if (!candidate && this.same(live, j.candidate_identity)) {
        } else fail('RESTORE_RECOVERY_REQUIRED');
        await this.fault('after-candidate-publish');
        j.stage = 'CANDIDATE_PUBLISHED';
        await this.write(j);
      }
      try {
        if (!this.same(await this.identity(j.target), j.candidate_identity))
          fail('RESTORE_RECOVERY_REQUIRED');
        j.stage = 'VALIDATING';
        await this.write(j);
        await this.fault('before-startup-validation');
        // Same Git repair operation also accounts for the final candidate -> DATA_DIR rename.
        await new BackupRestoreGitRepairService().verify(j.target, true);
        await this.backup.validator.domains(j.target);
        await this.fault('after-startup-validation');
        j.stage = 'COMPLETE';
        await this.write(j);
        await fs
          .unlink(path.join(this.paths.control, 'barrier.json'))
          .catch((e) => {
            if (e.code !== 'ENOENT') throw e;
          });
        await syncDirectory(this.paths.control);
        return this.status();
      } catch (e) {
        if (
          j.old_identity &&
          this.same(await this.identity(j.target), j.candidate_identity) &&
          this.same(await this.identity(j.old_root), j.old_identity)
        ) {
          await fs.rename(
            j.target,
            path.join(this.paths.control, 'failed', j.operation_id),
          );
          await fs.rename(j.old_root, j.target);
          j.stage = 'ROLLED_BACK';
          await this.write(j);
        }
        fail('RESTORE_RECOVERY_REQUIRED');
      }
    } finally {
      await lease?.release();
    }
  }
}
