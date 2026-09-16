import path from 'path';
import fs from 'fs/promises';
import config from '../../config';
import { randomUUID } from 'crypto';
import {
  fail,
  privateDirectory,
  privateJson,
  readJson,
  syncDirectory,
} from './files';
import RuntimePathResolver from '../runtimePaths';
import { RuntimeLease } from '../runtimeProcess';
export const backupId = (id: unknown): string => {
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    )
  )
    fail('BACKUP_ID_INVALID');
  return id as string;
};
export class BackupPaths {
  readonly data: string;
  readonly root: string;
  readonly control: string;
  constructor(
    data = config.dataPath,
    root = process.env.BACKUP_DIR || path.resolve(data) + '-backups',
  ) {
    this.data = path.resolve(data);
    this.root = path.resolve(root);
    this.control = this.data + '.platform-control';
    for (const a of [this.data, this.root, this.control])
      for (const b of [this.data, this.root, this.control])
        if (a !== b && a.startsWith(b + path.sep)) fail('BACKUP_ROOT_INVALID');
    if (new Set([this.data, this.root, this.control]).size !== 3)
      fail('BACKUP_ROOT_INVALID');
  }
  async initialize() {
    await privateDirectory(this.control, true);
    await privateDirectory(this.root, true);
    for (const name of [
      'snapshots',
      '.staging',
      'exports',
      'imports',
      'operations',
    ])
      await privateDirectory(path.join(this.root, name), true);
  }
  async bucket(
    name: 'snapshots' | '.staging' | 'exports' | 'imports' | 'operations',
    id?: string,
  ) {
    const base = await privateDirectory(
      path.join(await privateDirectory(this.root), name),
    );
    return id ? path.join(base, backupId(id)) : base;
  }
  async allocate(name: '.staging' | 'imports') {
    const id = randomUUID(),
      root = await this.bucket(name, id);
    await fs.mkdir(root, { mode: 0o700 });
    const stat = await fs.lstat(root);
    await privateJson(path.join(root, '.owner.json'), {
      version: 1,
      id,
      dev: stat.dev,
      ino: stat.ino,
    });
    return { id, root };
  }
  async assertOwned(root: string, id: string) {
    await privateDirectory(root);
    const stat = await fs.lstat(root),
      owner = await readJson(path.join(root, '.owner.json'));
    if (
      owner.version !== 1 ||
      owner.id !== backupId(id) ||
      owner.dev !== stat.dev ||
      owner.ino !== stat.ino
    )
      fail('BACKUP_OWNERSHIP_INVALID');
  }
  async remove(name: 'snapshots' | 'imports' | '.staging', id: string) {
    const root = await this.bucket(name, id);
    await this.assertOwned(root, id);
    await fs.rm(root, { recursive: true });
    await syncDirectory(path.dirname(root));
  }
}
class LifetimePaths extends RuntimePathResolver {
  async lock(id: number) {
    if (id !== 1) fail('BACKUP_ID_INVALID');
    return path.join(await privateDirectory(this.dataRoot), 'backend.lock');
  }
}
export async function acquireBackendLease(paths: BackupPaths) {
  await paths.initialize();
  try {
    return await RuntimeLease.acquire(new LifetimePaths(paths.control), 1);
  } catch {
    fail('RESTORE_BACKEND_ACTIVE');
  }
}
