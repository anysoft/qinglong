import { Router, Request, Response, NextFunction } from 'express';
import { Container } from 'typedi';
import { Logger } from 'winston';
import config from '../config';
import SystemService from '../services/system';
import { celebrate, Joi } from 'celebrate';
import UserService from '../services/user';
import { t } from '../shared/i18n';
import { isDefaultAuthInfo } from '../shared/auth';
import {
  parseVersion,
} from '../config/util';
import dayjs from 'dayjs';

const route = Router();

export default (app: Router) => {
  app.use('/system', route);

  route.get('/', async (req: Request, res: Response, next: NextFunction) => {
    const logger: Logger = Container.get('logger');
    try {
      const userService = Container.get(UserService);
      const authInfo = await userService.getAuthInfo();
      const { version, changeLog, changeLogLink, publishTime } =
        await parseVersion(config.versionFile);

      const isInitialized = !isDefaultAuthInfo(authInfo);
      res.send({
        code: 200,
        data: {
          isInitialized,
          version,
          publishTime: dayjs(publishTime).unix(),
          branch: process.env.QL_BRANCH || 'master',
          changeLog,
          changeLogLink,
        },
      });
    } catch (e) {
      logger.error('🔥 error: %o', e);
      return next(e);
    }
  });

  route.get(
    '/config',
    async (req: Request, res: Response, next: NextFunction) => {
      const logger: Logger = Container.get('logger');
      try {
        const systemService = Container.get(SystemService);
        const data = await systemService.getSystemConfig();
        res.send({ code: 200, data });
      } catch (e) {
        return next(e);
      }
    },
  );

  route.put(
    '/config/log-remove-frequency',
    celebrate({
      body: Joi.object({
        logRemoveFrequency: Joi.number().integer().min(0).max(3650).allow(null),
      }),
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const systemService = Container.get(SystemService);
        const result = await systemService.updateLogRemoveFrequency(req.body);
        res.send(result);
      } catch (e) {
        return next(e);
      }
    },
  );

  route.put(
    '/notify',
    celebrate({
      body: Joi.object({
        title: Joi.string().required(),
        content: Joi.string().required(),
      }),
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      const logger: Logger = Container.get('logger');
      try {
        const systemService = Container.get(SystemService);
        const result = await systemService.notify(req.body);
        res.send(result);
      } catch (e) {
        return next(e);
      }
    },
  );

  route.get(
    '/log',
    celebrate({
      query: {
        startTime: Joi.string().allow('').optional(),
        endTime: Joi.string().allow('').optional(),
        limit: Joi.number()
          .integer()
          .min(1)
          .max(1024 * 1024)
          .optional(),
        t: Joi.string().optional(),
      },
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const systemService = Container.get(SystemService);
        await systemService.getSystemLog(
          res,
          req.query as {
            startTime?: string;
            endTime?: string;
            limit?: number;
          },
        );
      } catch (e) {
        return next(e);
      }
    },
  );

  route.delete(
    '/log',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const systemService = Container.get(SystemService);
        await systemService.deleteSystemLog();
        res.send({ code: 200 });
      } catch (e) {
        return next(e);
      }
    },
  );

  route.put(
    '/auth/reset',
    celebrate({
      body: Joi.object({
        retries: Joi.number().optional(),
        twoFactorActivated: Joi.boolean().optional(),
        password: Joi.string().optional(),
        username: Joi.string().optional(),
      }),
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userService = Container.get(UserService);
        const result = await userService.resetAuthInfo(req.body);
        if (result) {
          return res.send(result);
        }
        res.send({ code: 200, message: t('更新成功') });
      } catch (e) {
        return next(e);
      }
    },
  );

  route.put(
    '/config/timezone',
    celebrate({
      body: Joi.object({
        timezone: Joi.string().allow('').allow(null),
      }),
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const systemService = Container.get(SystemService);
        const result = await systemService.updateTimezone(req.body);
        res.send(result);
      } catch (e) {
        return next(e);
      }
    },
  );

  route.put(
    '/config/lang',
    celebrate({
      body: Joi.object({
        lang: Joi.string().allow('').allow(null),
      }),
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const systemService = Container.get(SystemService);
        const result = await systemService.updateLanguage(req.body);
        res.send(result);
      } catch (e) {
        return next(e);
      }
    },
  );

  route.put(
    '/config/panel-title',
    celebrate({
      body: Joi.object({
        panelTitle: Joi.string().max(100).allow('').allow(null),
      }),
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const systemService = Container.get(SystemService);
        const result = await systemService.updatePanelTitle(req.body);
        res.send(result);
      } catch (e) {
        return next(e);
      }
    },
  );

};
