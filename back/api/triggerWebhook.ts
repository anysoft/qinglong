import express, { Application, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import TaskTriggerService from '../services/taskTrigger';
import TriggerEvents from '../services/triggerEvents';
import { secretDigest, TriggerError } from '../shared/triggerDefinition';

/** Mounted before global parsers/authentication. Never persists request bodies. */
export default function triggerWebhook(app: Application) {
  const service = new TaskTriggerService(),
    events = new TriggerEvents();
  const parser = express.json({
    limit: '64kb',
    strict: true,
    type: 'application/json',
    inflate: false,
  });
  app.post('/hooks/:publicId', async (req: Request, res: Response) => {
    try {
      if (Object.keys(req.query).length)
        throw new TriggerError('WEBHOOK_UNAUTHORIZED', 401);
      const id = await service.authenticate(
        req.params.publicId,
        req.headers.authorization,
      );
      if (
        req.headers['content-encoding'] &&
        req.headers['content-encoding'] !== 'identity'
      )
        throw new TriggerError('WEBHOOK_BODY_INVALID');
      if (Number(req.headers['content-length'] ?? 0) > 65536)
        throw new TriggerError('WEBHOOK_BODY_TOO_LARGE', 413);
      if (
        (Number(req.headers['content-length'] ?? 0) > 0 ||
          req.headers['transfer-encoding']) &&
        !req.is('application/json')
      )
        throw new TriggerError('WEBHOOK_BODY_INVALID', 415);
      const key = req.headers['idempotency-key'];
      if (
        key !== undefined &&
        (typeof key !== 'string' ||
          !key.length ||
          key.length > 200 ||
          /[^\x21-\x7e]/.test(key))
      )
        throw new TriggerError('WEBHOOK_IDEMPOTENCY_KEY_INVALID');
      await new Promise<void>((resolve, reject) =>
        parser(req, res, (error) =>
          error
            ? reject(
                new TriggerError(
                  'WEBHOOK_BODY_INVALID',
                  error.status === 413 ? 413 : 400,
                ),
              )
            : resolve(),
        ),
      );
      const event = await events.receive(
        id,
        `webhook:${secretDigest(key ?? randomUUID())}`,
      );
      const result = await events.dispatch(event.id);
      res
        .status(202)
        .json({ event_id: event.id, run_id: result?.task_run_id ?? null });
    } catch (error: any) {
      const status = error instanceof TriggerError ? error.status : 503;
      res
        .status(status)
        .json({
          error_code:
            error instanceof TriggerError
              ? error.error_code
              : 'WEBHOOK_UNAVAILABLE',
        });
    }
  });
}
