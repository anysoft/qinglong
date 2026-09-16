import { Router, Request, Response } from 'express';
import { Container } from 'typedi';
import { Joi } from 'celebrate';
import { sequelize } from '../data';
import { taskRepository } from '../services/taskRelationships';
import { SubscriptionModel } from '../data/subscription';
import { ConfigAssetModel } from '../data/configAsset';
import ConfigAssetService from '../services/configAsset';
import TaskConfigService from '../services/taskConfig';
import TaskHookService from '../services/taskHooks';
import TaskWorkspaceResolver from '../services/taskWorkspace';
import { ConfigAssetError, configId } from '../shared/configAssets';
const id = Joi.number().integer().positive();
const assetSchema = Joi.object({
  name: Joi.string().required().max(255),
  description: Joi.string().allow('').max(4096),
  content_type: Joi.string().valid('TEXT', 'BINARY'),
  is_secret: Joi.boolean().required(),
  content: Joi.string()
    .allow('')
    .max(1024 * 1024),
  expected_version: id,
});
const bindingSchema = Joi.object({
  asset_id: id.allow(null),
  operation: Joi.string().valid('ATTACH', 'MASK').required(),
  target_base: Joi.string().valid('WORKSPACE_ROOT', 'TASK_DIR').required(),
  target_path: Joi.string().required(),
  materialization_mode: Joi.string().valid('COPY', 'SYMLINK').required(),
  conflict_policy: Joi.string()
    .valid('FAIL_IF_EXISTS', 'REPLACE_RESTORE')
    .required(),
  writable: Joi.boolean().required(),
  enabled: Joi.boolean().required(),
  expected_version: id,
});
const hookSchema = Joi.object({
  name: Joi.string().required(),
  phase: Joi.string()
    .valid('BEFORE', 'AFTER_SUCCESS', 'AFTER_FAILURE', 'FINALLY')
    .required(),
  command: Joi.string().required(),
  cwd_base: Joi.string().valid('TASK_CWD', 'WORKSPACE_ROOT').required(),
  position: Joi.number().integer().min(0).required(),
  timeout_seconds: Joi.number().integer().min(1).max(3600).required(),
  failure_policy: Joi.string().valid('FAIL_EXECUTION', 'CONTINUE').required(),
  enabled: Joi.boolean().required(),
  expected_version: id,
});
function validate(schema: any, value: unknown) {
  const result = schema.validate(value);
  if (result.error) throw new ConfigAssetError('CONFIG_REQUEST_INVALID');
  return result.value;
}
function endpoint(action: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      if (/(?:^|\/)open\//i.test(req.originalUrl))
        throw new ConfigAssetError('CONFIG_PANEL_SESSION_REQUIRED', 403);
      res.send({ code: 200, data: await action(req) });
    } catch (error) {
      const known = error instanceof ConfigAssetError;
      const status = known ? error.status : 400;
      res
        .status(status)
        .send({
          code: status,
          message: known ? error.code : 'CONFIG_OPERATION_FAILED',
        });
    }
  };
}
export default function configAssetRoutes(app: Router) {
  const assets = Container.get(ConfigAssetService),
    bindings = Container.get(TaskConfigService),
    hooks = Container.get(TaskHookService);
  app.get(
    '/config-assets',
    endpoint(async () => assets.list()),
  );
  app.post(
    '/config-assets',
    endpoint(async (req) => assets.save(validate(assetSchema, req.body))),
  );
  app.get(
    '/config-assets/:id/revisions',
    endpoint(async (req) => assets.revisions(configId(Number(req.params.id)))),
  );
  app.get(
    '/config-assets/:id/content',
    endpoint(async (req) => assets.content(configId(Number(req.params.id)))),
  );
  app.get(
    '/config-assets/:id/usage',
    endpoint(async (req) => assets.usage(configId(Number(req.params.id)))),
  );
  app.put(
    '/config-assets/:id',
    endpoint(async (req) =>
      assets.save({
        ...validate(assetSchema, req.body),
        id: configId(Number(req.params.id)),
      }),
    ),
  );
  app.post(
    '/config-assets/:id/revisions',
    endpoint(async (req) =>
      assets.save({
        ...validate(assetSchema, req.body),
        id: configId(Number(req.params.id)),
      }),
    ),
  );
  app.delete(
    '/config-assets/:id',
    endpoint(async (req) =>
      assets.remove(configId(Number(req.params.id)), Number(req.query.version)),
    ),
  );
  for (const [resource, scope] of [
    ['repositories', 'repository'],
    ['tasks', 'task'],
  ] as const) {
    const base = `/${resource}/:owner/config-bindings`;
    app.get(
      base,
      endpoint(async (req) =>
        bindings.list(scope, configId(Number(req.params.owner))),
      ),
    );
    app.post(
      base,
      endpoint(async (req) =>
        bindings.save(
          scope,
          configId(Number(req.params.owner)),
          validate(bindingSchema, req.body),
        ),
      ),
    );
    app.put(
      base + '/:id',
      endpoint(async (req) =>
        bindings.save(scope, configId(Number(req.params.owner)), {
          ...validate(bindingSchema, req.body),
          id: configId(Number(req.params.id)),
        }),
      ),
    );
    app.delete(
      base + '/:id',
      endpoint(async (req) =>
        bindings.remove(
          scope,
          configId(Number(req.params.owner)),
          configId(Number(req.params.id)),
          Number(req.query.version),
        ),
      ),
    );
  }
  app.get(
    '/tasks/:id/config-preview',
    endpoint(async (req) => bindings.preview(configId(Number(req.params.id)))),
  );
  app.get(
    '/tasks/:id/config-context',
    endpoint(async (req) =>
      sequelize.transaction(async (transaction) => {
        const { repository_id } = await taskRepository(configId(Number(req.params.id)), transaction);
        return {
          repository_id,
          inherited: repository_id
            ? await bindings.list('repository', repository_id, transaction)
            : [],
        };
      }),
    ),
  );
  app.get(
    '/tasks/:id/hooks',
    endpoint(async (req) => hooks.list(configId(Number(req.params.id)))),
  );
  app.post(
    '/tasks/:id/hooks',
    endpoint(async (req) =>
      hooks.save(
        configId(Number(req.params.id)),
        validate(hookSchema, req.body),
      ),
    ),
  );
  app.put(
    '/tasks/:id/hooks/reorder',
    endpoint(async (req) =>
      hooks.reorder(
        configId(Number(req.params.id)),
        validate(
          Joi.array()
            .max(100)
            .items(
              Joi.object({
                id: id.required(),
                position: Joi.number().integer().min(0).required(),
                version: id.required(),
              }),
            ),
          req.body,
        ),
      ),
    ),
  );
  app.put(
    '/tasks/:id/hooks/:hook',
    endpoint(async (req) =>
      hooks.save(configId(Number(req.params.id)), {
        ...validate(hookSchema, req.body),
        id: configId(Number(req.params.hook)),
      }),
    ),
  );
  app.delete(
    '/tasks/:id/hooks/:hook',
    endpoint(async (req) =>
      hooks.remove(
        configId(Number(req.params.id)),
        configId(Number(req.params.hook)),
        Number(req.query.version),
      ),
    ),
  );
}
