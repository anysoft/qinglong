import { Router, Request, Response } from 'express';
import { Container } from 'typedi';
import DiscoveryService from '../services/discovery';
import WorktreeService from '../services/worktree';
import { SubscriptionModel } from '../data/subscription';
import {
  TriggerError,
  positiveTriggerId,
  exactKeys,
} from '../shared/triggerDefinition';
export default function discoveryRoutes(app: Router) {
  const discovery = new DiscoveryService();
  const endpoint =
    (action: (id: number, req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        if (/^\/open\//i.test(req.originalUrl))
          throw new TriggerError('PANEL_SESSION_REQUIRED', 403);
        res.json({
          code: 200,
          data: await action(positiveTriggerId(Number(req.params.id)), req),
        });
      } catch (error: any) {
        const status = error instanceof TriggerError ? error.status : 500;
        res
          .status(status)
          .json({
            code: status,
            error_code:
              error instanceof TriggerError
                ? error.error_code
                : 'DISCOVERY_OPERATION_FAILED',
          });
      }
    };
  app.get(
    '/subscriptions/:id/discovery',
    endpoint((id) => discovery.policy(id)),
  );
  app.put(
    '/subscriptions/:id/discovery',
    endpoint((id, req) => discovery.savePolicy(id, req.body)),
  );
  for (const operation of ['preview', 'apply'] as const)
    app.post(
      `/subscriptions/:id/discovery/${operation}`,
      endpoint(async (id, req) => {
        exactKeys(req.body ?? {}, []);
        const sub = await SubscriptionModel.findByPk(id);
        if (!sub?.worktree_id)
          throw new TriggerError('DISCOVERY_WORKTREE_REQUIRED');
        return Container.get(WorktreeService).locked(
          sub.worktree_id,
          'DISCOVERY_RECONCILE',
          async () =>
            operation === 'preview'
              ? discovery.preview(id)
              : discovery.reconcile(id),
        );
      }),
    );
}
