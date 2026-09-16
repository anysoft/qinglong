import type { Router, Request, Response, NextFunction } from 'express';
import { platformBarrier } from './platform';
/** Retain admission until the handler's final awaited mutation, even after socket close. */
export function protectApiMutations(
  router: Router,
  provider = platformBarrier,
) {
  const visit = (stack: any[]) => {
    for (const layer of stack) {
      if (layer.route) {
        if (
          typeof layer.route.path === 'string' &&
          /^\/(backups|restores|restore)(\/|$)/.test(layer.route.path)
        )
          continue;
        for (const entry of layer.route.stack) {
          const original = entry.handle;
          if (original.length === 4) continue;
          entry.handle = function (
            req: Request,
            res: Response,
            next: NextFunction,
          ) {
            void provider()
              .then(async (barrier) => {
                const read = req.method === 'GET' || req.method === 'HEAD';
                if (
                  read &&
                  (await barrier.state())?.phase === 'RESTORE_PENDING'
                )
                  return original(req, res, next);
                return barrier.mutation(async () => {
                  await original(req, res, next);
                }, read);
              })
              .catch((error) => {
                if (res.destroyed || res.writableEnded) return;
                if ((error as any).code === 'PLATFORM_BACKUP_IN_PROGRESS')
                  res
                    .status(503)
                    .json({
                      code: 503,
                      message: 'PLATFORM_BACKUP_IN_PROGRESS',
                    });
                else next(error);
              });
          };
        }
      } else if (layer.handle?.stack) visit(layer.handle.stack);
    }
  };
  visit((router as any).stack);
  return router;
}
