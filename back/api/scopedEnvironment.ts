import { Router, Request, Response } from 'express';
import { Container } from 'typedi';
import { Joi } from 'celebrate';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../data';
import { TaskModel } from '../data/task';
import { taskRepository } from '../services/taskRelationships';
import { SubscriptionModel } from '../data/subscription';
import RepositoryEnvProfileService from '../services/repositoryEnvProfile';
import ScopedEnvVariableService from '../services/scopedEnvVariable';
import TaskEnvironmentResolver from '../services/taskEnvironmentResolver';
import { ScopedEnvironmentError } from '../shared/scopedEnv';

const idSchema = Joi.number().integer().positive().required();
const profileSchema = Joi.object({ id: idSchema.optional(), repository_id: idSchema.optional(), name: Joi.string().max(255), description: Joi.string().allow('').max(65536), status: Joi.string().valid('enabled', 'disabled'), is_default: Joi.boolean() });
const variableSchema = Joi.array().max(1000).items(Joi.object({ name: Joi.string().required(), value: Joi.string().allow('').max(122880), clear: Joi.boolean(), replace_secret: Joi.boolean(), operation: Joi.string().valid('SET', 'UNSET'), status: Joi.string().valid('enabled', 'disabled'), is_secret: Joi.boolean(), position: Joi.number(), labels: Joi.array().items(Joi.string()) }));
function validate(schema: any, input: unknown) {
  const result = schema.validate(input);
  if (result.error) throw new ScopedEnvironmentError('ENV_REQUEST_INVALID');
  return result.value;
}
function endpoint(action: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      if (/(?:^|\/)open\//i.test(req.originalUrl)) throw new ScopedEnvironmentError('ENV_PANEL_SESSION_REQUIRED', 403);
      return res.send({ code: 200, data: await action(req) });
    } catch (error) {
      const known = error instanceof ScopedEnvironmentError;
      return res.status(known ? error.status : 400).send({ code: known ? error.status : 400, message: known ? error.code : 'ENV_OPERATION_FAILED' });
    }
  };
}
export default function scopedEnvironmentRoutes(app: Router) {
  const router = Router();
  app.use('/scoped-env', router);
  router.get('/global/variables', endpoint(async () => Container.get(ScopedEnvVariableService).list('global', 0)));
  router.put('/global/variables', endpoint(async req => Container.get(ScopedEnvVariableService).save('global', 0, validate(variableSchema, req.body))));
  const id = (req: Request) => validate(idSchema, req.params.id);
  router.get('/repositories', endpoint(async () => sequelize.query('SELECT r.id,r.name,r.default_env_profile_id,COUNT(p.id) AS profiles_count FROM Repositories r LEFT JOIN EnvironmentProfiles p ON p.repository_id=r.id GROUP BY r.id ORDER BY r.name', { type: QueryTypes.SELECT })));
  router.get('/tasks', endpoint(async () => sequelize.query('SELECT c.id,c.name,c.env_profile_id,c.subscription_id,COUNT(v.id) AS variables_count FROM Tasks c LEFT JOIN TaskEnvVariables v ON v.task_id=c.id GROUP BY c.id ORDER BY c.id DESC', { type: QueryTypes.SELECT })));
  router.get('/repositories/:id/profiles', endpoint(async req => Container.get(RepositoryEnvProfileService).list(id(req))));
  router.get('/profiles/:id', endpoint(async req => Container.get(RepositoryEnvProfileService).detail(id(req))));
  router.post('/profiles', endpoint(async req => { const input = validate(profileSchema, req.body); delete input.id; return Container.get(RepositoryEnvProfileService).save(input); }));
  router.put('/profiles', endpoint(async req => { const input = validate(profileSchema, req.body); validate(idSchema, input.id); return Container.get(RepositoryEnvProfileService).save(input); }));
  router.delete('/profiles/:id', endpoint(async req => { await Container.get(RepositoryEnvProfileService).remove(id(req)); return null; }));
  router.post('/profiles/:id/clone', endpoint(async req => Container.get(RepositoryEnvProfileService).clone(id(req), validate(Joi.object({ name: Joi.string().max(255).required() }), req.body).name)));
  for (const [resource, scope] of [['profiles', 'repository'], ['tasks', 'task']] as const) {
    router.get(`/${resource}/:id/variables`, endpoint(async req => Container.get(ScopedEnvVariableService).list(scope, id(req))));
    router.put(`/${resource}/:id/variables`, endpoint(async req => Container.get(ScopedEnvVariableService).save(scope, id(req), validate(variableSchema, req.body))));
  }
  for (const scope of ['task', 'subscription'] as const) {
    router.put(`/${scope}s/:id/profile`, endpoint(async req => Container.get(ScopedEnvVariableService).bind(scope, id(req), validate(Joi.object({ env_profile_id: Joi.number().integer().positive().allow(null).required() }), req.body).env_profile_id)));
    router.get(`/${scope}s/:id/context`, endpoint(async req => {
      const owner = scope === 'task' ? await TaskModel.findByPk(id(req)) : await SubscriptionModel.findByPk(id(req));
      if (!owner) throw new ScopedEnvironmentError('ENV_OWNER_NOT_FOUND', 404);
      const repository_id = scope === 'task' ? (await taskRepository(id(req))).repository_id : (owner as any).repository_id;
      return { id: owner.id, env_profile_id: owner.env_profile_id, repository_id, profiles: repository_id ? await Container.get(RepositoryEnvProfileService).list(repository_id) : [] };
    }));
  }
  router.get('/tasks/:id/preview', endpoint(async req => Container.get(TaskEnvironmentResolver).preview(id(req))));
}
