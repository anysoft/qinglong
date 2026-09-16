import { Router, Request, Response } from 'express';
import RunObservability, {
  positiveId,
  selectRows,
} from '../services/runObservability';
import RunLogService from '../services/runLog';
import NotificationChannels, {
  channelProviders,
} from '../services/notificationChannels';
import { notificationDispatcher } from '../services/notificationDispatcher';
import { ExecutionError, safeExecutionError } from '../shared/execution';
export default function observabilityRoutes(app: Router) {
  const query = (req: Request) =>
    Object.fromEntries(
      Object.entries(req.query).filter(([key]) => key !== 't'),
    );
  const runs = new RunObservability(),
    logs = new RunLogService(),
    channels = new NotificationChannels();
  const endpoint =
    (fn: (req: Request) => Promise<any>) =>
    async (req: Request, res: Response) => {
      try {
        if (/^\/open(?:\/|$)/i.test(req.originalUrl))
          throw new ExecutionError('PANEL_SESSION_REQUIRED', 403);
        res.send({ code: 200, data: await fn(req) });
      } catch (e: any) {
        const status = e instanceof ExecutionError ? e.status : 500;
        res
          .status(status)
          .send({
            code: status,
            error_code: safeExecutionError(e, 'OBSERVABILITY_FAILED'),
            message: safeExecutionError(e, 'OBSERVABILITY_FAILED'),
          });
      }
    };
  app.get(
    '/task-runs',
    endpoint((req) => runs.list(query(req))),
  );
  app.get(
    '/task-runs/:id',
    endpoint((req) => runs.detail(positiveId(req.params.id))),
  );
  app.get(
    '/task-runs/:id/attempts',
    endpoint((req) => runs.attempts(positiveId(req.params.id))),
  );
  app.get(
    '/task-runs/:id/events',
    endpoint((req) =>
      runs.events(positiveId(req.params.id), Number(req.query.after ?? 0)),
    ),
  );
  app.get(
    '/task-runs/:id/log',
    endpoint((req) => logs.read(positiveId(req.params.id), query(req))),
  );
  app.get(
    '/observability/summary',
    endpoint((req) => runs.summary(String(req.query.range ?? '24h'))),
  );
  app.get(
    '/tasks/:id/health',
    endpoint((req) => runs.health(positiveId(req.params.id))),
  );
  app.get(
    '/tasks/:id/stats',
    endpoint((req) =>
      runs.summary(String(req.query.range ?? '24h'), positiveId(req.params.id)),
    ),
  );
  app.get(
    '/notification-providers',
    endpoint(async () => channelProviders),
  );
  app.get(
    '/notification-channels',
    endpoint(() => channels.list()),
  );
  app.post(
    '/notification-channels',
    endpoint((req) => channels.save(req.body)),
  );
  app.get(
    '/notification-channels/:id',
    endpoint((req) => channels.get(positiveId(req.params.id))),
  );
  app.patch(
    '/notification-channels/:id',
    endpoint((req) => channels.save(req.body, positiveId(req.params.id))),
  );
  app.delete(
    '/notification-channels/:id',
    endpoint((req) =>
      channels.archive(positiveId(req.params.id), req.body.expected_version),
    ),
  );
  app.post(
    '/notification-channels/:id/test',
    endpoint((req) => channels.test(positiveId(req.params.id))),
  );
  app.get(
    '/tasks/:id/notification-policy',
    endpoint((req) => channels.policy(positiveId(req.params.id))),
  );
  app.patch(
    '/tasks/:id/notification-policy',
    endpoint((req) => channels.savePolicy(positiveId(req.params.id), req.body)),
  );
  app.get(
    '/notification-deliveries',
    endpoint((req) => notificationDispatcher.list(req.query)),
  );
  app.get(
    '/notification-deliveries/:id/attempts',
    endpoint((req) =>
      notificationDispatcher.attempts(positiveId(req.params.id)),
    ),
  );
  app.post(
    '/notification-deliveries/:id/retry',
    endpoint((req) => notificationDispatcher.retry(positiveId(req.params.id))),
  );
  app.get(
    '/trigger-events/:id',
    endpoint(async (req) => {
      const [event] = await selectRows(
        'SELECT id,trigger_id,task_id,trigger_type,status,task_run_id,error_code,createdAt FROM TriggerEvents WHERE id=:id',
        { id: positiveId(req.params.id) },
      );
      if (!event) throw new ExecutionError('TRIGGER_EVENT_NOT_FOUND', 404);
      return event;
    }),
  );
  notificationDispatcher.start();
}
