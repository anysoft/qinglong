import { Request, Response, NextFunction } from 'express';

// Body-parser failures happen before resource controllers and may quote raw request
// fragments. Catch only the new namespace before the legacy generic error handlers.
export function scopedEnvironmentHttpError(error: Error & { status?: number }, req: Request, res: Response, next: NextFunction) {
  if (!/\/scoped-env(?:\/|$)/.test(req.path)) return next(error);
  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 400;
  return res.status(status).json({ code: status, message: 'ENV_REQUEST_INVALID' });
}
