import { Request, Response, Router } from 'express';
import TaskTriggerService from '../services/taskTrigger';
import {
  TriggerError,
  positiveTriggerId,
  exactKeys,
} from '../shared/triggerDefinition';

export default function taskTriggerRoutes(app: Router) {
  const service = new TaskTriggerService();
  const endpoint =
    (action: (req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        if (/^\/open\//i.test(req.originalUrl))
          throw new TriggerError('PANEL_SESSION_REQUIRED', 403);
        res.json({ code: 200, data: await action(req) });
      } catch (error: any) {
        const status = error instanceof TriggerError ? error.status : 500;
        res
          .status(status)
          .json({
            code: status,
            error_code:
              error instanceof TriggerError
                ? error.error_code
                : 'TRIGGER_OPERATION_FAILED',
          });
      }
    };
  const task = (req: Request) => positiveTriggerId(Number(req.params.taskId));
  const trigger = (req: Request) =>
    positiveTriggerId(Number(req.params.triggerId));
  app.get(
    '/tasks/:taskId/triggers',
    endpoint((req) => service.list(task(req))),
  );
  app.post(
    '/tasks/:taskId/triggers',
    endpoint((req) => service.save(task(req), req.body)),
  );
  app.put(
    '/tasks/:taskId/triggers/:triggerId',
    endpoint((req) => service.save(task(req), req.body, trigger(req))),
  );
  app.delete(
    '/tasks/:taskId/triggers/:triggerId',
    endpoint((req) => {
      exactKeys(req.body, ['expected_version']);
      return service.remove(task(req), trigger(req), req.body.expected_version);
    }),
  );
  app.post(
    '/tasks/:taskId/triggers/:triggerId/rotate-secret',
    endpoint((req) => {
      exactKeys(req.body, ['expected_version']);
      return service.rotate(task(req), trigger(req), req.body.expected_version);
    }),
  );
  app.get(
    '/tasks/:taskId/trigger-events',
    endpoint((req) => service.events(task(req))),
  );
}
