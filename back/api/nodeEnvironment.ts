import { Router, Request } from 'express';
import { Joi } from 'celebrate';
import RuntimeOperationService from '../services/runtimeOperations';
import NodeEnvironmentResolver from '../services/nodeEnvironmentResolver';
import RuntimeOperationLog from '../services/runtimeLog';
import { endpoint, operationDto } from './runtime';
import { RuntimeError, runtimeId } from '../shared/runtime';
import { NodeOperationType } from '../shared/nodeEnvironment';
const id = () => Joi.number().integer().positive();
const dependency = Joi.object({
  name: Joi.string().max(214).required(),
  specifier: Joi.string().max(200).required(),
  type: Joi.string().valid('DEPENDENCY', 'DEV_DEPENDENCY').required(),
}).unknown(false);
const definition = {
  name: Joi.string().max(100).required(),
  description: Joi.string().allow('').max(1000),
  runtime_id: id().required(),
  toolchain_id: id().required(),
  dependencies: Joi.array().items(dependency).max(100).required(),
  production_only: Joi.boolean(),
  install_scripts_policy: Joi.string().valid('ALLOW', 'IGNORE'),
};
function body(req: Request, fields: Record<string, Joi.Schema> = {}) {
  const result = Joi.object(fields)
    .unknown(false)
    .validate(req.body ?? {}, { convert: false });
  if (result.error) throw new RuntimeError('NODE_REQUEST_INVALID', 400);
  return result.value;
}
export default function nodeEnvironmentRoutes(
  app: Router,
  operations: RuntimeOperationService,
) {
  const service = operations.node,
    base = '/runtime/node',
    resolver = new NodeEnvironmentResolver(service);
  app.get(
    base + '/catalog',
    endpoint(async () => {
      const p = await service.getProvider();
      return { versions: p.catalog, last_refresh_at: p.last_refresh_at };
    }),
  );
  app.get(
    base + '/installations',
    endpoint(async () => service.runtimes()),
  );
  app.get(
    base + '/toolchains',
    endpoint(async () => service.toolchains()),
  );
  app.get(
    base + '/diagnostics',
    endpoint(async () => service.diagnostics()),
  );
  const operation = (
    url: string,
    type: NodeOperationType,
    fields: Record<string, Joi.Schema>,
    method: 'post' | 'delete' = 'post',
    key?: string,
  ) =>
    app[method](
      url,
      endpoint(async (req) => {
        const input = body(req, {
          ...fields,
          timeout_seconds: Joi.number().integer().min(1).max(7200),
        });
        if (key) input[key] = runtimeId(req.params.id);
        if (req.params.build) input.build_id = runtimeId(req.params.build);
        return operationDto(
          await operations.request(type, {
            node: input,
            timeout_seconds: input.timeout_seconds,
          }),
        );
      }, true),
    );
  operation(base + '/catalog', 'NODE_CATALOG_REFRESH', {});
  operation(base + '/installations', 'NODE_RUNTIME_INSTALL', {
    version: Joi.string().max(20).required(),
  });
  for (const action of ['verify', 'repair'] as const)
    operation(
      base + '/installations/:id/' + action,
      action === 'verify' ? 'NODE_RUNTIME_VERIFY' : 'NODE_RUNTIME_REPAIR',
      {},
      'post',
      'runtime_id',
    );
  operation(
    base + '/installations/:id',
    'NODE_RUNTIME_REMOVE',
    {},
    'delete',
    'runtime_id',
  );
  app.get(
    base + '/installations/:id/references',
    endpoint(async (req) => {
      const r = await service.runtime(runtimeId(req.params.id));
      return operations.references.inspect(r.id);
    }),
  );
  operation(base + '/toolchains', 'NODE_PACKAGE_MANAGER_INSTALL', {
    runtime_id: id().required(),
    manager_type: Joi.string().valid('PNPM', 'NPM').required(),
    version: Joi.string().max(20),
  });
  operation(
    base + '/toolchains/:id/verify',
    'NODE_PACKAGE_MANAGER_VERIFY',
    {},
    'post',
    'toolchain_id',
  );
  operation(
    base + '/toolchains/:id',
    'NODE_PACKAGE_MANAGER_REMOVE',
    {},
    'delete',
    'toolchain_id',
  );
  app.get(
    base + '/toolchains/:id/references',
    endpoint(async (req) =>
      service.toolchainReferences(runtimeId(req.params.id)),
    ),
  );
  const env = base + '/environments';
  app.get(
    env,
    endpoint(async () => service.environments()),
  );
  app.post(
    env,
    endpoint(async (req) => service.definition(body(req, definition))),
  );
  app.get(
    env + '/:id',
    endpoint(async (req) => service.environment(runtimeId(req.params.id))),
  );
  app.patch(
    env + '/:id',
    endpoint(async (req) =>
      service.metadata(
        runtimeId(req.params.id),
        body(req, {
          name: definition.name,
          description: Joi.string().allow('').max(1000).required(),
          expected_version: id().required(),
        }),
      ),
    ),
  );
  app.post(
    env + '/:id/revisions',
    endpoint(async (req) =>
      service.definition(
        body(req, { ...definition, expected_version: id().required() }),
        runtimeId(req.params.id),
      ),
    ),
  );
  app.get(
    env + '/:id/revisions',
    endpoint(async (req) => service.revisions(runtimeId(req.params.id))),
  );
  app.get(
    env + '/:id/builds',
    endpoint(async (req) => service.builds(runtimeId(req.params.id))),
  );
  app.post(
    env + '/:id/clone',
    endpoint(async (req) =>
      service.clone(
        runtimeId(req.params.id),
        body(req, { name: definition.name }).name,
      ),
    ),
  );
  for (const [action, type] of Object.entries({
    build: 'NODE_ENV_BUILD',
    rebuild: 'NODE_ENV_REBUILD',
    resolve: 'NODE_ENV_RESOLVE',
  }))
    operation(
      env + '/:id/' + action,
      type as NodeOperationType,
      { expected_version: id().required() },
      'post',
      'environment_id',
    );
  for (const [action, type] of Object.entries({
    verify: 'NODE_ENV_VERIFY',
    promote: 'NODE_ENV_PROMOTE',
  }))
    operation(
      env + '/:id/builds/:build/' + action,
      type as NodeOperationType,
      { expected_version: id().required() },
      'post',
      'environment_id',
    );
  operation(
    env + '/:id/builds/:build',
    'NODE_ENV_DELETE_BUILD',
    { expected_version: id().required() },
    'delete',
    'environment_id',
  );
  operation(
    env + '/:id',
    'NODE_ENV_DELETE',
    { expected_version: id().required() },
    'delete',
    'environment_id',
  );
  app.get(
    env + '/:id/diff',
    endpoint(async (req) =>
      service.diff(
        runtimeId(req.params.id),
        runtimeId(req.query.from),
        runtimeId(req.query.to),
      ),
    ),
  );
  app.get(
    env + '/:id/resolve',
    endpoint(async (req) => {
      const result = await resolver.resolve(runtimeId(req.params.id));
      try {
        return result.snapshot;
      } finally {
        await result.lease.release();
      }
    }),
  );
  app.get(
    env + '/:id/builds/:build/export',
    endpoint(async (req) => {
      const b = await service.build(
        runtimeId(req.params.build),
        runtimeId(req.params.id),
      );
      return {
        package_json: b.package_json,
        lockfile: b.lockfile,
        lock_hash: b.lock_hash,
      };
    }),
  );
  app.get(
    env + '/:id/operations',
    endpoint(async (req) =>
      (await operations.operations())
        .filter(
          (x) =>
            x.operation_type.startsWith('NODE_') &&
            x.metadata.environment_id === runtimeId(req.params.id),
        )
        .map(operationDto),
    ),
  );
  // One operation model/log/cancel API shared by both languages.
  app.get(
    '/runtime/operations',
    endpoint(async (req) =>
      (await operations.operations())
        .filter((x) =>
          req.query.language === 'NODE'
            ? x.operation_type.startsWith('NODE_')
            : req.query.language === 'PYTHON'
            ? !x.operation_type.startsWith('NODE_')
            : true,
        )
        .map(operationDto),
    ),
  );
  app.get(
    '/runtime/operations/:id',
    endpoint(async (req) =>
      operationDto(await operations.operation(runtimeId(req.params.id))),
    ),
  );
  app.get(
    '/runtime/operations/:id/log',
    endpoint(async (req) =>
      RuntimeOperationLog.read(operations.paths, runtimeId(req.params.id)),
    ),
  );
  app.post(
    '/runtime/operations/:id/cancel',
    endpoint(async (req) => {
      body(req);
      return operationDto(await operations.cancel(runtimeId(req.params.id)));
    }),
  );
}
