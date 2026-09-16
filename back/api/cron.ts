import { Router, Request, Response, NextFunction } from 'express';
import { Container } from 'typedi';
import { Logger } from 'winston';
import CurrentTaskBridgeService from '../services/cron';
import { celebrate, Joi } from 'celebrate';
import {
  RunningInstanceModel,
  InstanceStatus,
} from '../data/runningInstance';
import { t } from '../shared/i18n';
import cronClient from '../schedule/client';

const route = Router();

export default (app: Router) => {
  app.use('/crons', route);

  route.use(async (req, res, next) => {
    // B08/B14: result callbacks and historical execution diagnostics only.
    // Task definition CRUD is exclusively /api/tasks.
    if (!['/status', '/detail'].includes(req.path) && !/^\/\d+\/(?:logs?|instances(?:\/\d+\/stop)?)$/.test(req.path))
      return res.status(410).send({ code: 410, error_code: 'TASK_API_REQUIRED', message: 'Use /api/tasks' });
    // Keep stop/status callbacks available even when the scheduler is down.
    if (['POST', 'PUT', 'DELETE'].includes(req.method) &&
      ['/', '/run', '/enable', '/disable', '/views/enable', '/views/disable'].includes(req.path)) {
      try {
        await cronClient.readiness.ensureReady();
      } catch (error) {
        return next(error);
      }
    }
    return next();
  });

  route.get(
    '/detail',
    async (req: Request, res: Response, next: NextFunction) => {
      const logger: Logger = Container.get('logger');
      try {
        const cronService = Container.get(CurrentTaskBridgeService);
        const data = await cronService.find(req.query as any);
        return res.send({ code: 200, data });
      } catch (e) {
        logger.error('🔥 error: %o', e);
        return next(e);
      }
    },
  );

  route.get(
    '/:id/log',
    celebrate({
      params: Joi.object({
        id: Joi.number().required(),
      }),
      query: Joi.object({
        offset: Joi.number().integer().min(0).optional(),
        limit: Joi.number()
          .integer()
          .min(1)
          .max(1024 * 1024)
          .optional(),
        tail: Joi.boolean().optional(),
        t: Joi.string().optional(),
      }).unknown(true),
    }),
    async (req: Request<{ id: number }>, res: Response, next: NextFunction) => {
      const logger: Logger = Container.get('logger');
      try {
        const cronService = Container.get(CurrentTaskBridgeService);
        const result = await cronService.log(req.params.id, {
          offset: req.query.offset as unknown as number,
          limit: req.query.limit as unknown as number,
          tail: req.query.tail as unknown as boolean,
        });
        return res.send({
          code: 200,
          data: result.content,
          logStatus: result.status,
          offset: result.offset,
          nextOffset: result.nextOffset,
          total: result.total,
          truncated: result.truncated,
        });
      } catch (e) {
        return next(e);
      }
    },
  );

  route.put(
    '/status',
    celebrate({
      body: Joi.object({
        ids: Joi.array().items(Joi.number().required()),
        status: Joi.string().required(),
        pid: Joi.string().optional().allow(null),
        log_path: Joi.string().optional().allow(null),
        last_running_time: Joi.number().optional().allow(null),
        last_execution_time: Joi.number().optional().allow(null),
        exit_code: Joi.number().optional().allow(null),
      }),
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const cronService = Container.get(CurrentTaskBridgeService);
        const data = await cronService.status({
          ...req.body,
          status: req.body.status ? parseInt(req.body.status) : undefined,
          pid: req.body.pid ? parseInt(req.body.pid) : undefined,
        });
        return res.send({ code: 200, data });
      } catch (e) {
        return next(e);
      }
    },
  );

  route.get(
    '/:id/instances',
    celebrate({
      params: Joi.object({
        id: Joi.number().required(),
      }),
    }),
    async (req: Request<{ id: number }>, res: Response, next: NextFunction) => {
      try {
        const instances = await RunningInstanceModel.findAll({
          where: {
            cron_id: req.params.id,
          },
          order: [['started_at', 'DESC']],
          raw: true,
        });
        return res.send({ code: 200, data: instances });
      } catch (e) {
        return next(e);
      }
    },
  );

  route.post(
    '/:id/instances/:instanceId/stop',
    celebrate({
      params: Joi.object({
        id: Joi.number().required(),
        instanceId: Joi.number().required(),
      }),
    }),
    async (req: Request<{ id: number; instanceId: number }>, res: Response, next: NextFunction) => {
      try {
        const cronService = Container.get(CurrentTaskBridgeService);
        const data = await cronService.stopInstance(req.params.instanceId);
        return res.send(data);
      } catch (e) {
        return next(e);
      }
    },
  );

  route.get(
    '/:id/logs',
    celebrate({
      params: Joi.object({
        id: Joi.number().required(),
      }),
    }),
    async (req: Request<{ id: number }>, res: Response, next: NextFunction) => {
      const logger: Logger = Container.get('logger');
      try {
        const cronService = Container.get(CurrentTaskBridgeService);
        const data = await cronService.logs(req.params.id);
        return res.send({ code: 200, data });
      } catch (e) {
        return next(e);
      }
    },
  );
};
