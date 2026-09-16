import path from 'path';
import { backupSchemaIdentities } from './schemaIdentities';
import fs from 'fs/promises';
import { fail, hashFile, readJson, sha256, privateDirectory } from './files';
import { validateInventory } from './inventory';
import { backupDatabase, validateDatabase } from './sqlite';
import { BackupRestoreGitRepairService } from './git';
import {
  schemaSignature,
  PLATFORM_SCHEMA_VERSION,
} from '../../shared/operationalSchema';
export class BackupValidator {
  async domains(root: string) {
    const file = path.join(root, 'db/database.sqlite');
    await validateDatabase(file);
    const db = await backupDatabase(file);
    try {
      const metadata = await db.all('SELECT * FROM PlatformMetadata');
      if (metadata.length !== 1) fail('BACKUP_SCHEMA_INVALID');
      if (metadata[0].platform_schema_version > PLATFORM_SCHEMA_VERSION)
        fail('RESTORE_BACKUP_TOO_NEW');
      const identity =
        backupSchemaIdentities[metadata[0].platform_schema_version];
      if (
        !identity ||
        identity.model_signature !== metadata[0].model_signature ||
        identity.schema_signature !== metadata[0].schema_signature
      )
        fail('BACKUP_SCHEMA_INVALID');
      const objects = await db.all(
        "SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",
      );
      if (schemaSignature(objects) !== metadata[0].schema_signature)
        fail('BACKUP_SCHEMA_INVALID');
      if (
        objects.some((o) => o.name === 'TaskRuns') &&
        (
          await db.all(
            "SELECT count(*) n FROM TaskRuns WHERE status IN ('QUEUED','RESOLVING','RUNNING','RECOVERY_REQUIRED')",
          )
        )[0].n
      )
        fail('BACKUP_ACTIVE_RUNS');
      if (
        objects.some((o) => o.name === 'RuntimeOperations') &&
        (
          await db.all(
            "SELECT count(*) n FROM RuntimeOperations WHERE status IN ('QUEUED','RUNNING')",
          )
        )[0].n
      )
        fail('BACKUP_ACTIVE_RUNTIME_OPERATIONS');
      let after = 0;
      while (objects.some((o) => o.name === 'ConfigAssetRevisions')) {
        const revisions = await db.all(
          'SELECT id,asset_id,revision_number,size,checksum,storage_key FROM ConfigAssetRevisions WHERE id>? ORDER BY id LIMIT 500',
          [after],
        );
        if (!revisions.length) break;
        for (const row of revisions) {
          const canonical = `asset-${row.asset_id}/revisions/${row.revision_number}/content`;
          if (
            row.storage_key !== canonical &&
            row.storage_key !== `config-assets/${canonical}`
          )
            fail('BACKUP_CONFIG_INTEGRITY_FAILED');
          await privateDirectory(
            path.dirname(path.join(root, 'config-assets', canonical)),
          );
          const value = await hashFile(
            path.join(root, 'config-assets', canonical),
          );
          if (value.size !== row.size || value.sha256 !== row.checksum)
            fail('BACKUP_CONFIG_INTEGRITY_FAILED');
          after = row.id;
        }
      }
      const counts: Record<string, number> = {};
      for (const table of [
        'TaskRuns',
        'TaskRunAttempts',
        'TaskRunEvents',
        'TaskHealthStates',
        'TriggerEvents',
        'NotificationChannels',
        'NotificationOutbox',
        'NotificationDeliveries',
        'RuntimeInstallations',
        'PythonEnvironments',
        'NodeEnvironments',
      ]) {
        if (objects.some((o) => o.name === table))
          counts[table] = (
            await db.all(`SELECT count(*) n FROM "${table}"`)
          )[0].n;
      }
      let missing = 0,
        unexpectedMissing = 0;
      after = 0;
      const columns = await db.all('PRAGMA table_info(TaskRuns)');
      const logColumn = columns.some((c) => c.name === 'log_size')
        ? 'log_size'
        : '0 AS log_size';
      while (objects.some((o) => o.name === 'TaskRuns')) {
        const rows = await db.all(
          `SELECT id,${logColumn} FROM TaskRuns WHERE id>? ORDER BY id LIMIT 500`,
          [after],
        );
        if (!rows.length) break;
        for (const row of rows) {
          const log = path.join(root, 'log/task-runs', `run-${row.id}.log`);
          const stat = await fs.lstat(log).catch((e) => {
            if (e.code === 'ENOENT') return null;
            throw e;
          });
          if (!stat) {
            missing++;
            if (row.log_size > 0) unexpectedMissing++;
          } else {
            await privateDirectory(path.dirname(log));
            if (
              !stat.isFile() ||
              stat.isSymbolicLink() ||
              stat.nlink !== 1 ||
              stat.mode & 0o077
            )
              fail('BACKUP_LOG_INVALID');
          }
          after = row.id;
        }
      }
      return {
        schema: metadata[0].platform_schema_version,
        counts,
        historical_missing_log: missing,
        integrity_warnings: unexpectedMissing ? ['BACKUP_LOG_MISSING'] : [],
      };
    } finally {
      await db.close();
    }
  }
  async validate(snapshot: string) {
    await privateDirectory(snapshot);
    for await (const entry of await fs.opendir(snapshot))
      if (
        ![
          '.owner.json',
          'manifest.json',
          'inventory.ndjson',
          'data',
          'READY',
        ].includes(entry.name)
      )
        fail('BACKUP_UNEXPECTED_FILE');
    const manifest = await readJson(
      path.join(snapshot, 'manifest.json'),
      4 * 1024 * 1024,
    );
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        manifest.backup_id,
      ) ||
      manifest.format_version !== 1 ||
      manifest.mode !== 'FULL_PORTABLE' ||
      !manifest.inventory ||
      !manifest.database
    )
      fail('BACKUP_MANIFEST_INVALID');
    const owner = await readJson(path.join(snapshot, '.owner.json'));
    if (owner.version !== 1 || owner.id !== manifest.backup_id)
      fail('BACKUP_OWNERSHIP_INVALID');
    const marker = await readJson(path.join(snapshot, 'READY'));
    if (marker.manifest_sha256 !== sha256(JSON.stringify(manifest) + '\n'))
      fail('BACKUP_MANIFEST_INVALID');
    const inventory = await hashFile(path.join(snapshot, 'inventory.ndjson'));
    if (
      inventory.sha256 !== manifest.inventory.sha256 ||
      inventory.size !== manifest.inventory.size
    )
      fail('BACKUP_CHECKSUM_FAILED');
    const data = path.join(snapshot, 'data');
    const size = await validateInventory(
      data,
      path.join(snapshot, 'inventory.ndjson'),
    );
    const database = await hashFile(path.join(data, 'db/database.sqlite'));
    if (database.sha256 !== manifest.database.sha256)
      fail('BACKUP_CHECKSUM_FAILED');
    const domains = await this.domains(data),
      git = await new BackupRestoreGitRepairService().verify(data);
    if (
      manifest.platform_schema_version !== domains.schema ||
      manifest.total_bytes !== size.bytes ||
      manifest.file_count !== size.files ||
      JSON.stringify(domains) !== JSON.stringify(manifest.domains) ||
      JSON.stringify(git) !== JSON.stringify(manifest.git)
    )
      fail('BACKUP_MANIFEST_INVALID');
    return { manifest, size };
  }
}
