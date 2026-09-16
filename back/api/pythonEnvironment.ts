import { Request, Router } from 'express';
import { Joi } from 'celebrate';
import RuntimeOperationService from '../services/runtimeOperations';
import PythonEnvironmentService from '../services/pythonEnvironment';
import PythonEnvironmentResolver from '../services/pythonEnvironmentResolver';
import PythonEnvironmentReferenceService from '../services/pythonEnvironmentReferences';
import { RuntimeError, runtimeId } from '../shared/runtime';
import { PythonEnvironmentOperationType } from '../shared/pythonEnvironment';
import { endpoint, operationDto } from './runtime';
const name = Joi.string()
  .trim()
  .min(1)
  .max(100)
  .pattern(/^[^\u0000-\u001f\u007f]+$/)
  .required();
const description = Joi.string().allow('').max(1000).default('');
const requirements = Joi.array()
  .items(Joi.string().max(1000))
  .max(100)
  .required();
const id = Joi.number().integer().min(1).required();
const expected_version = Joi.number().integer().min(1).required();
function payload(req: Request, fields: Joi.SchemaMap) {
  const result = Joi.object(fields)
    .unknown(false)
    .validate(req.body ?? {}, { convert: false });
  if (result.error) throw new RuntimeError('PYTHON_ENV_REQUEST_INVALID', 400);
  return result.value;
}
export default function pythonEnvironmentRoutes(
  app: Router,
  runtime: RuntimeOperationService,
) {
  const service = new PythonEnvironmentService(runtime),
    base = '/runtime/python/environments';
  app.get(
    base,
    endpoint(async () => service.list()),
  );
  app.get(
    base + '/diagnostics',
    endpoint(async () => service.diagnostics()),
  );
  app.post(
    base,
    endpoint(async (req) =>
      service.create(
        payload(req, { name, description, runtime_id: id, requirements }),
      ),
    ),
  );
  app.get(
    base + '/:id',
    endpoint(async (req) => service.environment(runtimeId(req.params.id))),
  );
  app.patch(
    base + '/:id',
    endpoint(async (req) =>
      service.metadata(
        runtimeId(req.params.id),
        payload(req, { name, description, expected_version }),
      ),
    ),
  );
  app.get(
    base + '/:id/revisions',
    endpoint(async (req) => service.revisions(runtimeId(req.params.id))),
  );
  app.post(
    base + '/:id/revisions',
    endpoint(async (req) =>
      service.revise(
        runtimeId(req.params.id),
        payload(req, { runtime_id: id, requirements, expected_version }),
      ),
    ),
  );
  app.post(
    base + '/:id/clone',
    endpoint(async (req) =>
      service.clone(runtimeId(req.params.id), payload(req, { name }).name),
    ),
  );
  app.get(
    base + '/:id/builds',
    endpoint(async (req) => service.builds(runtimeId(req.params.id))),
  );
  app.get(
    base + '/:id/builds/:build',
    endpoint(async (req) =>
      service.build(runtimeId(req.params.id), runtimeId(req.params.build)),
    ),
  );
  app.get(
    base + '/:id/builds/:build/references',
    endpoint(async (req) => {
      await service.build(
        runtimeId(req.params.id),
        runtimeId(req.params.build),
      );
      return new PythonEnvironmentReferenceService().build(
        runtimeId(req.params.build),
      );
    }),
  );
  app.get(
    base + '/:id/builds/:build/freeze',
    endpoint(async (req) => ({
      text: (
        await service.build(
          runtimeId(req.params.id),
          runtimeId(req.params.build),
        )
      ).freeze,
    })),
  );
  app.get(
    base + '/:id/diff',
    endpoint(async (req) =>
      service.diff(
        runtimeId(req.params.id),
        runtimeId(req.query.from),
        runtimeId(req.query.to),
      ),
    ),
  );
  app.get(
    base + '/:id/resolve',
    endpoint(async (req) => {
      const result = await new PythonEnvironmentResolver(runtime).resolve(
        runtimeId(req.params.id),
      );
      try {
        return result.snapshot;
      } finally {
        await result.lease.release();
      }
    }),
  );
  app.get(
    base + '/:id/operations',
    endpoint(async (req) => {
      await service.environment(runtimeId(req.params.id));
      return (await runtime.operations())
        .filter((x) => x.metadata.environment_id === runtimeId(req.params.id))
        .map(operationDto);
    }),
  );
  for (const [route, type, remove, build] of [
    ['/:id/build', 'PYTHON_ENV_BUILD', false, false],
    ['/:id/rebuild', 'PYTHON_ENV_REBUILD', false, false],
    ['/:id', 'PYTHON_ENV_DELETE', true, false],
    ['/:id/builds/:build/verify', 'PYTHON_ENV_VERIFY', false, true],
    ['/:id/builds/:build/promote', 'PYTHON_ENV_PROMOTE', false, true],
    ['/:id/builds/:build', 'PYTHON_ENV_DELETE_BUILD', true, true],
  ] as const) {
    app[remove ? 'delete' : 'post'](
      base + route,
      endpoint(async (req) => {
        const data = payload(req, {
          expected_version,
          timeout_seconds: Joi.number().integer().min(1).max(7200),
        });
        return operationDto(
          await runtime.request(type as PythonEnvironmentOperationType, {
            environment: {
              environment_id: runtimeId(req.params.id),
              build_id: build ? runtimeId(req.params.build) : undefined,
              expected_version: data.expected_version,
            },
            timeout_seconds: data.timeout_seconds ?? 1800,
          }),
        );
      }, true),
    );
  }
}
