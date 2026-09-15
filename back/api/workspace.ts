import { Router, Request, Response } from 'express';
import { Container } from 'typedi';
import { Joi } from 'celebrate';
import RepositoryStorageService from '../services/repositoryStorage';
import WorktreeService from '../services/worktree';
import { WorkspaceError } from '../shared/workspaceError';
import { GitResourceError } from '../shared/gitSecurity';
const identifier = Joi.number().integer().positive().required();
function validate(schema: any, value: unknown) {
  const result = schema.validate(value);
  if (result.error)
    throw new WorkspaceError(
      'INVALID_REQUEST',
      'Invalid workspace request',
      400,
    );
  return result.value;
}
function endpoint(action: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      if (/^\/open\//i.test(req.originalUrl))
        throw new WorkspaceError('PANEL_SESSION_REQUIRED', undefined, 403);
      return res.send({ code: 200, data: await action(req) });
    } catch (e) {
      const status = e instanceof GitResourceError ? e.status : 500;
      return res
        .status(status)
        .send({
          code: status,
          error_code:
            e instanceof WorkspaceError ? e.error_code : 'GIT_OPERATION_FAILED',
          message:
            e instanceof GitResourceError
              ? e.message
              : 'Workspace operation failed; refresh diagnostics',
        });
    }
  };
}
export default function workspaceRoutes(app: Router) {
  const repository = () => Container.get(RepositoryStorageService),
    worktree = () => Container.get(WorktreeService);
  for (const operation of ['initialize', 'fetch', 'prune', 'repair'] as const)
    app.post(
      `/repositories/:id/${operation}`,
      endpoint(async (req) => {
        validate(Joi.object({}), req.body);
        return repository()[operation](validate(identifier, req.params.id));
      }),
    );
  app.get(
    '/repositories/:id/refs',
    endpoint(async (req) =>
      repository().refs(validate(identifier, req.params.id)),
    ),
  );
  app.get(
    '/repositories/:id/status',
    endpoint(async (req) =>
      repository().diagnostics(validate(identifier, req.params.id)),
    ),
  );
  app.get(
    '/repositories/:id/worktrees',
    endpoint(async (req) =>
      worktree().list(validate(identifier, req.params.id)),
    ),
  );
  app.post(
    '/repositories/:id/remote',
    endpoint(async (req) => {
      const data = validate(
        Joi.object({ remote_url: Joi.string().max(4096).required() }),
        req.body,
      );
      return repository().changeRemote(
        validate(identifier, req.params.id),
        data.remote_url,
      );
    }),
  );
  app.delete(
    '/repositories/:id',
    endpoint(async (req) =>
      repository().remove(validate(identifier, req.params.id)),
    ),
  );
  app.get(
    '/worktrees',
    endpoint(async (req) => {
      const id =
        req.query.repository_id === undefined
          ? undefined
          : validate(identifier, req.query.repository_id);
      return worktree().list(id);
    }),
  );
  app.get(
    '/worktrees/:id',
    endpoint(async (req) =>
      worktree().status(validate(identifier, req.params.id)),
    ),
  );
  app.post(
    '/worktrees',
    endpoint(async (req) =>
      worktree().create(
        validate(
          Joi.object({
            repository_id: identifier,
            name: Joi.string().trim().max(255).required(),
            ref_type: Joi.string().valid('branch', 'tag', 'commit').required(),
            ref_name: Joi.string().max(255).required(),
          }),
          req.body,
        ),
      ),
    ),
  );
  app.put(
    '/worktrees/:id',
    endpoint(async (req) => {
      const data = validate(
        Joi.object({ name: Joi.string().trim().max(255).required() }),
        req.body,
      );
      return worktree().rename(validate(identifier, req.params.id), data.name);
    }),
  );
  app.delete(
    '/worktrees/:id',
    endpoint(async (req) => {
      validate(Joi.object({}), req.body);
      return worktree().remove(validate(identifier, req.params.id));
    }),
  );
  for (const [route, operation] of [
    ['update', 'update'],
    ['refresh', 'status'],
    ['repair', 'repair'],
    ['remove-record', 'removeRecord'],
  ] as const)
    app.post(
      `/worktrees/:id/${route}`,
      endpoint(async (req) => {
        validate(Joi.object({}), req.body);
        return worktree()[operation](validate(identifier, req.params.id));
      }),
    );
}
