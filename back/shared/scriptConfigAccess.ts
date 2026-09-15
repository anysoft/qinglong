import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { Request, Response, NextFunction } from 'express';
import config from '../config';
import { ConfigAssetError, privateDirectory } from './configAssets';

/** B17: protect existing Script API from transient Config copies and backups.
 * Config executions hold SH; source API operations hold EX until both their
 * handler and response complete. Node retains the flock's open description. */
export function protectScriptConfigAccess(
  action: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    const closed = new Promise<void>((resolve) => {
      res.once('finish', resolve);
      res.once('close', resolve);
    });
    try {
      const root = path.join(config.dataPath, '.locks');
      await privateDirectory(root);
      handle = await fs.open(
        path.join(root, 'config-access.lock'),
        fsSync.constants.O_CREAT |
          fsSync.constants.O_RDWR |
          fsSync.constants.O_NOFOLLOW,
        0o600,
      );
      if (!(await handle.stat()).isFile())
        throw new ConfigAssetError('CONFIG_ACCESS_FAILED', 503);
      const child = spawn(
        'python3',
        [
          '-I',
          '-S',
          path.join(config.rootPath, 'shell/config_access_lease.py'),
        ],
        { stdio: ['ignore', 'ignore', 'ignore', handle.fd] },
      );
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      if (code !== 0)
        throw new ConfigAssetError(
          code === 75 ? 'CONFIG_WORKSPACE_BUSY' : 'CONFIG_ACCESS_FAILED',
          code === 75 ? 409 : 503,
        );
      const journals = path.join(config.dataPath, 'tmp/config-materialization');
      const entries = await fs
        .readdir(journals, { withFileTypes: true })
        .catch((error) => {
          if (error.code === 'ENOENT') return [];
          throw error;
        });
      for (const entry of entries)
        if (
          !entry.isDirectory() ||
          (await fs.readdir(path.join(journals, entry.name))).length
        )
          throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      await action(req, res, next);
      await closed;
    } catch (error) {
      if (!res.headersSent && !res.destroyed) {
        const known = error instanceof ConfigAssetError;
        const status = known ? error.status : 503;
        res
          .status(status)
          .send({
            code: status,
            message: known ? error.code : 'CONFIG_ACCESS_FAILED',
          });
      }
    } finally {
      await handle?.close();
    }
  };
}
