import fs from 'fs/promises';
import path from 'path';
import config from '../../config';
import { BackupPaths } from './paths';
import { PlatformBackupBarrier } from './barrier';
import { fail } from './files';
import type { Request, Response, NextFunction } from 'express';
const barriers = new Map<string, Promise<PlatformBackupBarrier>>();
export async function platformPaths() {
  const requested = path.resolve(config.dataPath);
  const stat = await fs.lstat(requested).catch((e) => {
    if (e.code === 'ENOENT') return null;
    throw e;
  });
  if (stat?.isSymbolicLink()) fail('BACKUP_ROOT_INVALID');
  const parent = await fs.realpath(path.dirname(requested));
  const paths = new BackupPaths(path.join(parent, path.basename(requested)));
  await paths.initialize();
  return paths;
}
export async function platformBarrier() {
  const key = config.dataPath + '|' + (process.env.BACKUP_DIR || '');
  let value = barriers.get(key);
  if (!value) {
    value = platformPaths().then(
      (paths) => new PlatformBackupBarrier(paths.control),
    );
    barriers.set(key, value);
    value.catch(() => barriers.delete(key));
  }
  return value;
}
export function PlatformMutation(drain = false): MethodDecorator {
  return (_target, _name, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (...args: unknown[]) {
      return (await platformBarrier()).mutation(
        () => original.apply(this, args),
        drain,
      );
    };
  };
}
export function backupAdmission(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (
    !/^\/(api|open|hooks)(\/|$)/.test(req.path) ||
    /^\/api\/(backups|restores|restore)(\/|$)/.test(req.path)
  )
    return next();
  void platformBarrier()
    .then(async (barrier) => {
      if (
        (req.method === 'GET' || req.method === 'HEAD') &&
        (await barrier.state())?.phase === 'RESTORE_PENDING'
      ) {
        next();
        return;
      }
      return barrier.mutation(
        () =>
          new Promise<void>((resolve) => {
            if (res.destroyed || res.writableEnded) {
              resolve();
              return;
            }
            res.once('finish', resolve);
            res.once('close', resolve);
            next();
          }),
        req.method === 'GET' || req.method === 'HEAD',
      );
    })
    .catch(() => {
      if (!res.headersSent)
        res
          .status(503)
          .json({ code: 503, message: 'PLATFORM_BACKUP_IN_PROGRESS' });
    });
}
