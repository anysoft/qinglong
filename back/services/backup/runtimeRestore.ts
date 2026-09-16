import path from 'path';
import fs from 'fs/promises';
import { backupDatabase } from './sqlite';
import { privateJson } from './files';
import NodePathResolver from '../nodePaths';
import RuntimePathResolver from '../runtimePaths';
import PythonEnvironmentPathResolver from '../pythonEnvironmentPaths';
/** Offline domain reconciliation: immutable historical build snapshots are never rewritten. */
export class RuntimeRestoreReconciler {
  async plan(root: string) {
    const db = await backupDatabase(path.join(root, 'db/database.sqlite'));
    try {
      return {
        python_runtimes: await db.all(
          "SELECT id,version FROM RuntimeInstallations WHERE language='PYTHON' AND state IN ('MISSING','ERROR')",
        ),
        node_runtimes: await db.all(
          "SELECT id,version FROM RuntimeInstallations WHERE language='NODE' AND state IN ('MISSING','ERROR')",
        ),
        toolchains: await db.all(
          "SELECT id,runtime_id,manager_type,version FROM NodePackageManagerToolchains WHERE state='ERROR'",
        ),
        python_environments: await db.all(
          "SELECT id FROM PythonEnvironments WHERE state='ERROR'",
        ),
        node_environments: await db.all(
          "SELECT id FROM NodeEnvironments WHERE state='ERROR'",
        ),
      };
    } finally {
      await db.close();
    }
  }
  async reconcile(root: string) {
    const db = await backupDatabase(
      path.join(root, 'db/database.sqlite'),
      true,
    );
    try {
      await db.all('BEGIN IMMEDIATE');
      try {
        await db.all(
          "UPDATE RuntimeProviders SET state='MISSING',last_verified_at=NULL,last_error='RESTORE_REBUILD_REQUIRED' WHERE language='PYTHON' AND state<>'UNINITIALIZED'",
        );
        await db.all(
          "UPDATE RuntimeInstallations SET state='MISSING',verified_at=NULL,last_error='RESTORE_REBUILD_REQUIRED' WHERE state<>'REMOVED'",
        );
        await db.all(
          "UPDATE NodePackageManagerToolchains SET state='ERROR',verified_at=NULL,last_error='RESTORE_REBUILD_REQUIRED' WHERE state<>'REMOVED'",
        );
        for (const prefix of ['Python', 'Node']) {
          await db.all(
            `UPDATE ${prefix}EnvironmentBuilds SET health='MISSING',verified_at=NULL,last_error='RESTORE_REBUILD_REQUIRED'`,
          );
          await db.all(
            `UPDATE ${prefix}Environments SET state='ERROR',last_error='RESTORE_REBUILD_REQUIRED' WHERE state<>'DELETING'`,
          );
        }
        // The stable incident/outbox state is retained. Only orphan delivery ownership is reconciled.
        await db.all(
          "UPDATE NotificationDeliveries SET result='INTERRUPTED',error_code='DELIVERY_INTERRUPTED',finished_at=CURRENT_TIMESTAMP WHERE result='SENDING'",
        );
        await db.all(
          "UPDATE NotificationOutbox SET status='RETRY',claim_token=NULL,claimed_at=NULL,last_error_code='DELIVERY_INTERRUPTED',next_attempt_at=CURRENT_TIMESTAMP WHERE status='SENDING'",
        );
        await db.all('COMMIT');
      } catch (e) {
        await db.all('ROLLBACK');
        throw e;
      }
      const python = await db.all('SELECT id FROM PythonEnvironments'),
        node = await db.all('SELECT id FROM NodeEnvironments');
      const pyPaths = new PythonEnvironmentPathResolver(
          new RuntimePathResolver(root),
        ),
        nodePaths = new NodePathResolver(root);
      for (const row of python) await pyPaths.environment(row.id, true);
      for (const row of node) {
        const target = await nodePaths.target('environment', row.id);
        if (!(await fs.lstat(target).catch(() => null)))
          await nodePaths.create('environment', row.id);
      }
      return {
        python_runtimes: await db.all(
          "SELECT id,version FROM RuntimeInstallations WHERE language='PYTHON' AND state='MISSING'",
        ),
        node_runtimes: await db.all(
          "SELECT id,version FROM RuntimeInstallations WHERE language='NODE' AND state='MISSING'",
        ),
        toolchains: await db.all(
          "SELECT id,runtime_id,manager_type,version FROM NodePackageManagerToolchains WHERE last_error='RESTORE_REBUILD_REQUIRED'",
        ),
        python_environments: python,
        node_environments: node,
      };
    } finally {
      await db.close();
    }
  }
}
