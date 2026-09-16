import fs from 'fs/promises';
import path from 'path';
import { backupDatabase } from './sqlite';
import { fail, readJson } from './files';
/** Exclusion is allowed only for recognized platform storage, never arbitrary worktree names. */
export async function auditMaterializations(root: string) {
  const entries = async (relative: string) => {
    const dir = await fs.opendir(path.join(root, relative)).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    const names: string[] = [];
    if (dir)
      for await (const entry of dir) {
        if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
          fail('BACKUP_RECOVERY_REQUIRED');
        names.push(entry.name);
      }
    return names;
  };
  const allowed = async (relative: string, names: string[]) => {
    for (const name of await entries(relative))
      if (!names.includes(name)) fail('BACKUP_RECOVERY_REQUIRED');
  };
  const own = async (
    relative: string,
    marker: string,
    fields: Record<string, unknown>,
    inode = true,
  ) => {
    const stat = await fs.lstat(path.join(root, relative)).catch((e) => {
      if (e.code === 'ENOENT') return null;
      throw e;
    });
    if (!stat) return;
    if (!stat.isDirectory() || stat.isSymbolicLink())
      fail('BACKUP_RECOVERY_REQUIRED');
    const owner = await readJson(path.join(root, marker));
    if (
      Object.entries(fields).some(([key, value]) => owner[key] !== value) ||
      (inode && (owner.dev !== stat.dev || owner.ino !== stat.ino))
    )
      fail('BACKUP_RECOVERY_REQUIRED');
  };
  await allowed('runtime', ['python', 'node']);
  await allowed('runtime/python', ['pyenv', 'environments', 'quarantine']);
  await allowed('runtime/node', [
    'versions',
    'package-managers',
    'environments',
    'ownership',
    'quarantine',
  ]);
  await allowed('runtime/python/pyenv', [
    '.runtime-owner.json',
    'providers',
    'versions',
    'ownership',
  ]);
  const db = await backupDatabase(path.join(root, 'db/database.sqlite'));
  try {
    const providers = await db.all(
      "SELECT id FROM RuntimeProviders WHERE language='PYTHON'",
    );
    for (const row of providers)
      await own(
        'runtime/python/pyenv',
        'runtime/python/pyenv/.runtime-owner.json',
        { version: 1, owner: 'platform-runtime', provider_id: row.id },
        false,
      );
    if (!providers.length && (await entries('runtime/python/pyenv')).length)
      fail('BACKUP_RECOVERY_REQUIRED');
    const runtimes = await db.all(
      'SELECT id,language,version,provider_id FROM RuntimeInstallations',
    );
    await allowed(
      'runtime/python/pyenv/versions',
      runtimes.filter((r) => r.language === 'PYTHON').map((r) => r.version),
    );
    await allowed(
      'runtime/node/versions',
      runtimes
        .filter((r) => r.language === 'NODE')
        .map((r) => 'runtime-' + r.id),
    );
    for (const row of runtimes)
      if (row.language === 'PYTHON')
        await own(
          'runtime/python/pyenv/versions/' + row.version,
          'runtime/python/pyenv/ownership/runtime-' + row.id + '.json',
          {
            runtime_id: row.id,
            provider_id: row.provider_id,
            version: row.version,
          },
        );
      else
        await own(
          'runtime/node/versions/runtime-' + row.id,
          'runtime/node/ownership/runtime-' + row.id + '.json',
          { owner: 'platform-node', kind: 'runtime', id: row.id },
        );
    const tools = await db.all('SELECT id FROM NodePackageManagerToolchains');
    await allowed(
      'runtime/node/package-managers',
      tools.map((t) => 'toolchain-' + t.id),
    );
    for (const row of tools)
      await own(
        'runtime/node/package-managers/toolchain-' + row.id,
        'runtime/node/ownership/toolchain-' + row.id + '.json',
        { owner: 'platform-node', kind: 'toolchain', id: row.id },
      );
    for (const language of ['Python', 'Node']) {
      const environments = await db.all(
          `SELECT id FROM ${language}Environments`,
        ),
        prefix = 'runtime/' + language.toLowerCase() + '/environments';
      await allowed(
        prefix,
        environments.flatMap((e) =>
          language === 'Python'
            ? ['env-' + e.id, 'env-' + e.id + '.json']
            : ['env-' + e.id],
        ),
      );
      for (const row of environments)
        await own(
          prefix + '/env-' + row.id,
          language === 'Python'
            ? prefix + '/env-' + row.id + '.json'
            : 'runtime/node/ownership/environment-' + row.id + '.json',
          language === 'Python'
            ? { owner: 'python-environment', environment_id: row.id }
            : { owner: 'platform-node', kind: 'environment', id: row.id },
        );
    }
  } finally {
    await db.close();
  }
}
