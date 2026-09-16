import fs from 'fs/promises';
import { auditMaterializations } from './materializations';
import path from 'path';
import os from 'os';
import config from '../../config';
import { parseVersion } from '../../config/util';
import { createHash } from 'crypto';
import { BackupPaths } from './paths';
import { PlatformBackupBarrier } from './barrier';
import { BackupValidator } from './validator';
import { BackupRestoreGitRepairService } from './git';
import { snapshotDatabase, backupDatabase } from './sqlite';
import { CopyProgress, copyInventory } from './inventory';
import {
  fail,
  hashFile,
  privateJson,
  sha256,
  syncDirectory,
  openRegular,
  writeAll,
  readJson,
} from './files';
import { packArchive, unpackArchive } from './archive';
import { encryptPortable, decryptPortable } from './envelope';
async function platformVersion() {
  const version = (await parseVersion(config.versionFile).catch(() => null))
    ?.version;
  return typeof version === 'string' &&
    /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version)
    ? version
    : 'unknown';
}
export class BackupCoordinator {
  readonly barrier: PlatformBackupBarrier;
  readonly validator = new BackupValidator();
  constructor(readonly paths = new BackupPaths()) {
    this.barrier = new PlatformBackupBarrier(paths.control);
  }
  async idle() {
    const db = await backupDatabase(
      path.join(this.paths.data, 'db/database.sqlite'),
    );
    try {
      for (const [table, field, values] of [
        [
          'Repositories',
          'storage_state',
          "'INITIALIZING','FETCHING','DELETING'",
        ],
        ['Worktrees', 'lifecycle_state', "'CREATING','DELETING'"],
        [
          'TaskRuns',
          'status',
          "'QUEUED','RESOLVING','RUNNING','RECOVERY_REQUIRED'",
        ],
        ['RuntimeOperations', 'status', "'QUEUED','RUNNING'"],
        ['NotificationOutbox', 'status', "'SENDING'"],
      ])
        if (
          (
            await db.all(
              `SELECT COUNT(*) n FROM ${table} WHERE ${field} IN (${values})`,
            )
          )[0].n
        )
          return false;
      return true;
    } finally {
      await db.close();
    }
  }
  private async recoveryGate() {
    const walk = async (root: string): Promise<void> => {
      const entries = await fs.opendir(root).catch((e) => {
        if (e.code === 'ENOENT') return null;
        throw e;
      });
      if (!entries) return;
      for await (const e of entries) {
        if (e.isDirectory()) await walk(path.join(root, e.name));
        else fail('BACKUP_RECOVERY_REQUIRED');
      }
    };
    for (const name of [
      'tmp/config-materialization',
      'tmp/execution/node-bindings',
      'runtime/python/quarantine',
      'runtime/node/quarantine',
    ])
      await walk(path.join(this.paths.data, name));
  }
  async create(
    timeout = 600000,
    progress: CopyProgress = { processed_bytes: 0, processed_files: 0 },
    offline = false,
  ) {
    await this.paths.initialize();
    const action = async () => {
      await this.recoveryGate();
      await auditMaterializations(this.paths.data);
      const allocated = await this.paths.allocate('.staging');
      try {
        const data = path.join(allocated.root, 'data');
        await fs.mkdir(data, { mode: 0o700 });
        const excluded = [
          'runtime',
          '.locks',
          'syslog',
          'cache/runtime',
          'cache/python/pip',
          'cache/node',
          'tmp/runtime',
          'tmp/execution',
          'tmp/config-materialization',
        ];
        await copyInventory(
          this.paths.data,
          data,
          path.join(allocated.root, 'inventory.ndjson'),
          (name) =>
            excluded.includes(name) ||
            /^db\/database\.sqlite(?:-wal|-shm|-journal)?$/.test(name),
          progress,
        );
        await fs.mkdir(path.join(data, 'db'), { mode: 0o700 }).catch((e) => {
          if (e.code !== 'EEXIST') throw e;
        });
        await snapshotDatabase(
          path.join(this.paths.data, 'db/database.sqlite'),
          path.join(data, 'db/database.sqlite'),
        );
        const database = await hashFile(path.join(data, 'db/database.sqlite'));
        const list = await fs.open(
          path.join(allocated.root, 'inventory.ndjson'),
          'a',
        );
        try {
          await writeAll(
            list,
            Buffer.from(
              JSON.stringify({
                path: 'db/database.sqlite',
                kind: 'file',
                mode: 0o600,
                ...database,
              }) + '\n',
            ),
          );
          await list.sync();
        } finally {
          await list.close();
        }
        const domains = await this.validator.domains(data),
          git = await new BackupRestoreGitRepairService().verify(data);
        const manifest = {
          format_version: 1,
          backup_id: allocated.id,
          created_at: new Date().toISOString(),
          mode: 'FULL_PORTABLE',
          application_version: await platformVersion(),
          source_os: os.platform(),
          source_arch: os.arch(),
          platform_schema_version: domains.schema,
          included_components: [
            'database',
            'git',
            'worktrees',
            'config-assets',
            'log',
            'other-user-data',
          ],
          excluded_components: excluded,
          runtime_materialization_policy: 'EXCLUDED_EXPLICIT_REBUILD',
          database,
          inventory: await hashFile(
            path.join(allocated.root, 'inventory.ndjson'),
          ),
          domains,
          git,
          total_bytes: progress.processed_bytes + database.size,
          file_count: progress.processed_files + 1,
        };
        await privateJson(path.join(allocated.root, 'manifest.json'), manifest);
        await privateJson(path.join(allocated.root, 'READY'), {
          manifest_sha256: sha256(JSON.stringify(manifest) + '\n'),
        });
        await this.validator.validate(allocated.root);
        await syncDirectory(allocated.root);
        const target = await this.paths.bucket('snapshots', allocated.id);
        await fs.rename(allocated.root, target);
        await syncDirectory(path.dirname(target));
        return allocated.id;
      } catch (error) {
        await privateJson(path.join(allocated.root, 'FAILED'), {
          code: 'BACKUP_FAILED',
        }).catch(() => {});
        throw error;
      }
    };
    if (offline) {
      if (!(await this.idle())) fail('BACKUP_BUSY');
      return action();
    }
    return this.barrier.snapshot(() => this.idle(), action, timeout);
  }
  async list() {
    await this.paths.initialize();
    const result = [];
    for await (const e of await fs.opendir(
      await this.paths.bucket('snapshots'),
    )) {
      if (!e.isDirectory()) continue;
      try {
        const root = await this.paths.bucket('snapshots', e.name);
        await this.paths.assertOwned(root, e.name);
        const manifest = await readJson(path.join(root, 'manifest.json'));
        const marker = await readJson(path.join(root, 'READY'));
        if (marker.manifest_sha256 !== sha256(JSON.stringify(manifest) + '\n'))
          continue;
        result.push(this.publicManifest(manifest));
      } catch {
        /* invalid entries never READY */
      }
    }
    return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  publicManifest(m: any) {
    return {
      id: m.backup_id,
      created_at: m.created_at,
      status: 'READY',
      application_version: m.application_version,
      schema: m.platform_schema_version,
      mode: m.mode,
      size: m.total_bytes,
      file_count: m.file_count,
      source_os: m.source_os,
      source_arch: m.source_arch,
      components: m.included_components,
      excluded: m.excluded_components,
      counts: m.domains?.counts,
      validation: {
        status: 'PASS',
        warnings: m.domains?.integrity_warnings || [],
        historical_missing_log: m.domains?.historical_missing_log || 0,
      },
    };
  }
  async validate(id: string) {
    const root = await this.paths.bucket('snapshots', id);
    await this.paths.assertOwned(root, id);
    return this.publicManifest((await this.validator.validate(root)).manifest);
  }
  async export(id: string, passphrase: Buffer) {
    let job: { id: string; root: string } | undefined;
    try {
      const root = await this.paths.bucket('snapshots', id);
      await this.paths.assertOwned(root, id);
      await this.validator.validate(root);
      job = await this.paths.allocate('.staging');
      const archive = path.join(job.root, 'payload'),
        encrypted = path.join(job.root, 'encrypted');
      await packArchive(root, archive);
      await encryptPortable(archive, encrypted, passphrase);
      const output = await this.paths.bucket('exports', job.id);
      await fs.rename(encrypted, output);
      await syncDirectory(path.dirname(output));
      return job.id;
    } finally {
      passphrase.fill(0);
      if (job) await this.paths.remove('.staging', job.id);
    }
  }
  async import(file: string, passphrase: Buffer) {
    let job: { id: string; root: string } | undefined;
    try {
      job = await this.paths.allocate('imports');
      const payload = path.join(job.root, 'payload'),
        snapshot = path.join(job.root, 'snapshot');
      await decryptPortable(file, payload, passphrase);
      await fs.mkdir(snapshot, { mode: 0o700 });
      await unpackArchive(payload, snapshot);
      await fs.unlink(payload);
      const valid = await this.validator.validate(snapshot);
      await privateJson(path.join(job.root, 'VALIDATED'), {
        manifest_sha256: sha256(JSON.stringify(valid.manifest) + '\n'),
      });
      return job.id;
    } catch (e) {
      if (job) await this.paths.remove('imports', job.id);
      throw e;
    } finally {
      passphrase.fill(0);
    }
  }
}
