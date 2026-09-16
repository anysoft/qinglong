import nodeEnvironmentRoutes from './nodeEnvironment';
import pythonEnvironmentRoutes from './pythonEnvironment';
import { Router, Request, Response } from 'express';
import { Joi } from 'celebrate';
import RuntimeOperationService from '../services/runtimeOperations';
import RuntimeOperationLog from '../services/runtimeLog';
import { RuntimeError, runtimeId } from '../shared/runtime';
import { OperationType, RuntimeOperation } from '../data/runtime';

const options = {
  jobs: Joi.number().integer().min(1).max(16),
  timeout_seconds: Joi.number().integer().min(1).max(7200),
};
function payload(req: Request, install = false) {
  const schema = Joi.object({
    ...options,
    version: install ? Joi.string().max(20).required() : Joi.forbidden(),
  }).unknown(false);
  const result = schema.validate(req.body ?? {}, { convert: false });
  if (result.error) throw new RuntimeError('RUNTIME_REQUEST_INVALID', 400);
  return result.value;
}
export function operationDto(row: RuntimeOperation) {
  return {
    id: row.id,
    provider_id: row.provider_id,
    language: row.operation_type.startsWith('NODE_') ? 'NODE' : 'PYTHON',
    toolchain_id: row.metadata.toolchain_id ?? null,
    runtime_id: row.runtime_id,
    environment_id: row.metadata.environment_id ?? null,
    build_id: row.metadata.build_id ?? null,
    operation_type: row.operation_type,
    status: row.status,
    stage: row.stage,
    cancel_requested: row.cancel_requested,
    started_at: row.started_at,
    finished_at: row.finished_at,
    exit_code: row.exit_code,
    error_code: row.error_code,
    error_summary: row.error_summary,
  };
}
export function endpoint(
  action: (req: Request) => Promise<unknown>,
  accepted = false,
) {
  return async (req: Request, res: Response) => {
    try {
      if (/(?:^|\/)open\//i.test(req.originalUrl))
        throw new RuntimeError('RUNTIME_PANEL_SESSION_REQUIRED', 403);
      const data = await action(req);
      res.status(accepted ? 202 : 200).send({ code: 200, data });
    } catch (error) {
      const known = error instanceof RuntimeError,
        status = known ? error.status : 500;
      res.status(status).send({
        code: status,
        message: known ? error.error_code : 'RUNTIME_OPERATION_FAILED',
        ...(known && error.error_code === 'RUNTIME_REFERENCED'
          ? {
              references: (error as RuntimeError & { references?: unknown })
                .references,
            }
          : {}),
      });
    }
  };
}
let shared: RuntimeOperationService | undefined;
export default function runtimeRoutes(
  app: Router,
  service?: RuntimeOperationService,
) {
  const runtime = service ?? (shared ??= new RuntimeOperationService());
  runtime.startRecovery();
  pythonEnvironmentRoutes(app, runtime);
  nodeEnvironmentRoutes(app, runtime);
  const base = '/runtime/python';
  app.get(
    base + '/provider',
    endpoint(async () => runtime.providerHealth()),
  );
  app.get(
    base + '/catalog',
    endpoint(async () => {
      const p = await runtime.getProvider();
      return {
        versions: p.catalog,
        provider_revision: p.provider_revision,
        last_refresh_at: p.last_refresh_at,
      };
    }),
  );
  app.get(
    base + '/installations',
    endpoint(async () => runtime.runtimes()),
  );
  app.get(
    base + '/diagnostics',
    endpoint(async () => ({
      ...(await runtime.diagnostics.inspect()),
      filesystem: await runtime.filesystemDiagnostics(),
    })),
  );
  for (const [action, type] of Object.entries({
    setup: 'PROVIDER_INSTALL',
    update: 'PROVIDER_UPDATE',
    verify: 'PROVIDER_VERIFY',
    repair: 'PROVIDER_REPAIR',
    catalog: 'CATALOG_REFRESH',
  }))
    app.post(
      base + '/provider/' + action,
      endpoint(
        async (req) =>
          operationDto(
            await runtime.request(type as OperationType, payload(req)),
          ),
        true,
      ),
    );
  app.post(
    base + '/installations',
    endpoint(
      async (req) =>
        operationDto(
          await runtime.request('RUNTIME_INSTALL', payload(req, true)),
        ),
      true,
    ),
  );
  for (const [action, type] of Object.entries({
    verify: 'RUNTIME_VERIFY',
    repair: 'RUNTIME_REPAIR',
  }))
    app.post(
      base + '/installations/:id/' + action,
      endpoint(
        async (req) =>
          operationDto(
            await runtime.request(type as OperationType, {
              ...payload(req),
              runtime_id: runtimeId(req.params.id),
            }),
          ),
        true,
      ),
    );
  app.get(
    base + '/installations/:id/references',
    endpoint(async (req) => {
      const row = await runtime.runtime(runtimeId(req.params.id));
      return runtime.references.inspect(row.id);
    }),
  );
  app.delete(
    base + '/installations/:id',
    endpoint(
      async (req) =>
        operationDto(
          await runtime.request('RUNTIME_REMOVE', {
            ...payload(req),
            runtime_id: runtimeId(req.params.id),
          }),
        ),
      true,
    ),
  );
  app.get(
    base + '/operations',
    endpoint(async () => (await runtime.operations()).map(operationDto)),
  );
  app.get(
    base + '/operations/:id',
    endpoint(async (req) =>
      operationDto(await runtime.operation(runtimeId(req.params.id))),
    ),
  );
  app.get(
    base + '/operations/:id/log',
    endpoint(async (req) => {
      const row = await runtime.operation(runtimeId(req.params.id));
      return RuntimeOperationLog.read(runtime.paths, row.id);
    }),
  );
  app.post(
    base + '/operations/:id/cancel',
    endpoint(async (req) => {
      payload(req);
      return operationDto(await runtime.cancel(runtimeId(req.params.id)));
    }),
  );
}
