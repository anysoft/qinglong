import { Request, Response, NextFunction } from 'express';

// Body-parser failures happen before resource controllers and may quote raw request
// fragments. Catch only the new namespace before the generic error handlers.
export function scopedEnvironmentHttpError(error: Error & { status?: number }, req: Request, res: Response, next: NextFunction) {
  const environment = /\/scoped-env(?:\/|$)/.test(req.path);
  const execution = /\/(?:config-assets|config-bindings|config-preview|config-context|hooks)(?:\/|$)/.test(req.path);
  if (!environment && !execution) return next(error);
  const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 400;
  return res.status(status).json({ code: status, message: environment ? 'ENV_REQUEST_INVALID' : 'CONFIG_REQUEST_INVALID' });
}
