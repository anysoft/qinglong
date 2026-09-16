import { backupDatabase } from './sqlite';
import path from 'path';
import { BackupPaths } from './paths';
import RuntimeOperationService from '../runtimeOperations';
import { fail } from './files';
import { RuntimeRestoreReconciler } from './runtimeRestore';
/** Explicit online operation. All installation/build work belongs to the existing managers. */
export class RestoreRebuildService {
  constructor(
    readonly paths: BackupPaths,
    readonly operations = new RuntimeOperationService(),
  ) {}
  async run() {
    const db = await backupDatabase(
      path.join(this.paths.data, 'db/database.sqlite'),
    );
    const execute = async (type: any, input: any = {}) => {
      const operation = await this.operations.request(type, input);
      const result = await this.operations.wait(operation.id);
      if (result.status !== 'SUCCESS') fail('RESTORE_REBUILD_FAILED');
    };
    try {
      const python = await db.all(
          "SELECT id,version FROM RuntimeInstallations WHERE language='PYTHON' AND state='MISSING'",
        ),
        node = await db.all(
          "SELECT id,version FROM RuntimeInstallations WHERE language='NODE' AND state='MISSING'",
        );
      if (python.length) {
        const providers = await db.all(
          "SELECT state FROM RuntimeProviders WHERE language='PYTHON' AND state='READY'",
        );
        if (!providers.length) await execute('PROVIDER_INSTALL');
        for (const row of python)
          await execute('RUNTIME_INSTALL', { version: row.version });
      }
      if (node.length) {
        for (const row of node)
          await execute('NODE_RUNTIME_INSTALL', {
            node: { version: row.version },
          });
      }
      for (const row of await db.all(
        "SELECT id,runtime_id,manager_type,version FROM NodePackageManagerToolchains WHERE last_error='RESTORE_REBUILD_REQUIRED'",
      ))
        await execute('NODE_PACKAGE_MANAGER_INSTALL', {
          node: {
            runtime_id: row.runtime_id,
            manager_type: row.manager_type,
            version: row.version,
          },
        });
      for (const row of await db.all(
        "SELECT id,version FROM PythonEnvironments WHERE last_error='RESTORE_REBUILD_REQUIRED'",
      ))
        await execute('PYTHON_ENV_REBUILD', {
          environment: {
            environment_id: row.id,
            expected_version: row.version,
          },
        });
      for (const row of await db.all(
        "SELECT id,version,current_build_id FROM NodeEnvironments WHERE last_error='RESTORE_REBUILD_REQUIRED'",
      ))
        await execute(
          row.current_build_id ? 'NODE_ENV_REBUILD' : 'NODE_ENV_BUILD',
          { node: { environment_id: row.id, expected_version: row.version } },
        );
      const pending = await new RuntimeRestoreReconciler().plan(
        this.paths.data,
      );
      if (Object.values(pending).some((items) => items.length))
        fail('RESTORE_REBUILD_FAILED');
      return { status: 'SUCCESS' };
    } finally {
      await db.close();
    }
  }
}
