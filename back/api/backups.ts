import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { platformPaths } from '../services/backup/platform';
import { BackupCoordinator } from '../services/backup/coordinator';
import { RestoreService } from '../services/backup/restore';
import { BackupOperations } from '../services/backup/operations';
import { RestoreRebuildService } from '../services/backup/rebuild';
import { fail, openRegular } from '../services/backup/files';
function phrase(value: unknown) {
  if (
    typeof value !== 'string' ||
    !value.length ||
    Buffer.byteLength(value) > 4096
  )
    fail('BACKUP_PASSPHRASE_INVALID');
  return Buffer.from(value as string);
}
export default function backupRoutes(app: Router) {
  const route = Router();
  app.use(['/backups', '/restores', '/restore'], (req, res, next) => {
    if (/(?:^|\/)open(?:\/|$)/.test(req.baseUrl))
      return res
        .status(403)
        .json({ code: 403, message: 'PANEL_AUTH_REQUIRED' });
    next();
  });
  const handle =
    (
      action: (
        req: Request,
        paths: Awaited<ReturnType<typeof platformPaths>>,
        res: Response,
      ) => Promise<unknown>,
    ) =>
    async (req: Request, res: Response) => {
      try {
        const result = await action(req, await platformPaths(), res);
        if (!res.headersSent) res.json({ code: 200, data: result });
      } catch (e) {
        const code = (e as any).code || (e as Error).message;
        res
          .status(409)
          .json({
            code: 409,
            message: /^(?:BACKUP|RESTORE|PLATFORM)_[A-Z_]+$/.test(code)
              ? code
              : 'BACKUP_OPERATION_FAILED',
          });
      }
    };
  app.get(
    '/backups',
    handle(async (_, p) => new BackupCoordinator(p).list()),
  );
  app.get(
    '/backups/operations/:id',
    handle(async (req, p) => new BackupOperations(p).get(req.params.id)),
  );
  app.post(
    '/backups',
    handle(async (req, p) =>
      new BackupOperations(p).start('SNAPSHOT', (progress) =>
        new BackupCoordinator(p).create(
          req.body?.timeout_ms ?? 600000,
          progress,
        ),
      ),
    ),
  );
  app.get(
    '/backups/:id',
    handle(async (req, p) => new BackupCoordinator(p).validate(req.params.id)),
  );
  app.post(
    '/backups/:id/validate',
    handle(async (req, p) =>
      new BackupOperations(p).start('VALIDATE', () =>
        new BackupCoordinator(p).validate(req.params.id),
      ),
    ),
  );
  app.post(
    '/backups/:id/export',
    handle(async (req, p) => {
      const pass = phrase(req.body?.passphrase);
      delete req.body.passphrase;
      try {
        return await new BackupOperations(p).start('EXPORT', async () => {
          try {
            return await new BackupCoordinator(p).export(req.params.id, pass);
          } finally {
            pass.fill(0);
          }
        });
      } catch (e) {
        pass.fill(0);
        throw e;
      }
    }),
  );
  app.get(
    '/backups/exports/:id/download',
    handle(async (req, p, res) => {
      const file = await p.bucket('exports', req.params.id),
        input = await openRegular(file);
      const stat = await input.stat();
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${req.params.id}.platform-backup"`,
      );
      res.setHeader('Content-Length', stat.size);
      await new Promise<void>((resolve, reject) => {
        const stream = input.createReadStream();
        res.on('close', () => {
          stream.destroy();
          resolve();
        });
        stream.on('error', reject);
        res.on('finish', resolve);
        stream.pipe(res);
      });
    }),
  );
  app.delete(
    '/backups/:id',
    handle(async (req, p) =>
      new BackupOperations(p).exclusive(async () => {
        const j = await new RestoreService(p).journal();
        if (
          j?.snapshot_id === req.params.id &&
          !['COMPLETE', 'ROLLED_BACK', 'CANCELLED'].includes(j.stage)
        )
          fail('BACKUP_IN_USE');
        await p.remove('snapshots', req.params.id);
        return { deleted: true };
      }),
    ),
  );
  app.post(
    '/restores/import',
    handle(async (req, p) => {
      const upload = await p.allocate('.staging');
      try {
        await new Promise<void>((resolve, reject) =>
          multer({
            dest: upload.root,
            limits: {
              files: 1,
              fileSize: 1024 ** 4 + 80,
              fields: 1,
              fieldSize: 4096,
            },
          }).single('file')(req, {} as Response, (e) =>
            e ? reject(e) : resolve(),
          ),
        );
        if (!req.file) fail('BACKUP_UPLOAD_REQUIRED');
        await fs.chmod(req.file!.path, 0o600);
        const pass = phrase(req.body?.passphrase);
        delete req.body.passphrase;
        try {
          return await new BackupOperations(p).start('IMPORT', async () => {
            try {
              return await new BackupCoordinator(p).import(
                req.file!.path,
                pass,
              );
            } finally {
              await p.remove('.staging', upload.id);
            }
          });
        } catch (e) {
          pass.fill(0);
          throw e;
        }
      } catch (e) {
        await p.remove('.staging', upload.id);
        throw e;
      }
    }),
  );
  app.post(
    '/restores/:id/validate',
    handle(async (req, p) =>
      new BackupOperations(p).start('VALIDATE_IMPORT', async () => {
        const root = await p.bucket('imports', req.params.id);
        await p.assertOwned(root, req.params.id);
        return (
          await new BackupCoordinator(p).validator.validate(
            require('path').join(root, 'snapshot'),
          )
        ).size;
      }),
    ),
  );
  app.post(
    '/restores/:id/stage',
    handle(async (req, p) => {
      if (req.body?.confirmation !== 'RESTORE')
        fail('RESTORE_CONFIRMATION_REQUIRED');
      return new BackupOperations(p).start('STAGE_RESTORE', () =>
        new RestoreService(p).stage(
          req.params.id,
          req.body?.source === 'snapshots' ? 'snapshots' : 'imports',
        ),
      );
    }),
  );
  app.delete(
    '/restores/:id/stage',
    handle(async (req, p) =>
      new BackupOperations(p).exclusive(async () => {
        const service = new RestoreService(p);
        if ((await service.status())?.id !== req.params.id)
          fail('RESTORE_ID_INVALID');
        return service.cancel();
      }),
    ),
  );
  app.get(
    '/restore/status',
    handle(async (_, p) => new RestoreService(p).status()),
  );
  app.post(
    '/restore/rebuild',
    handle(async (_, p) =>
      new BackupOperations(p).start('REBUILD', () =>
        new RestoreRebuildService(p).run(),
      ),
    ),
  );
}
