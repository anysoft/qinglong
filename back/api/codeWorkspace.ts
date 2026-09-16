import { Router, Request, Response } from 'express';
import { Container } from 'typedi';
import { Joi } from 'celebrate';
import CodeWorkspaceService from '../services/codeWorkspace';
const id = Joi.number().integer().positive().required();
const relative = Joi.string().max(4096).required();
const expected = Joi.string()
  .pattern(/^[a-f0-9]{64}$/)
  .required();
const content = Joi.string()
  .allow('')
  .max(2 * 1024 * 1024)
  .required();
function validate(schema: any, value: unknown) {
  const r = schema.validate(value);
  if (r.error)
    throw Object.assign(new Error('INVALID_REQUEST'), {
      error_code: 'INVALID_REQUEST',
      status: 400,
    });
  return r.value;
}
export default function codeWorkspaceRoutes(app: Router) {
  const service = () => Container.get(CodeWorkspaceService);
  const route = (
    method: 'get' | 'post' | 'put' | 'delete',
    suffix: string,
    schema: any,
    action: (s: CodeWorkspaceService, id: number, value: any) => Promise<any>,
  ) =>
    app[method](
      '/workspaces/:worktreeId' + suffix,
      async (req: Request, res: Response) => {
        try {
          if (/^\/open(?:\/|$)/i.test(req.originalUrl))
            return res
              .status(403)
              .send({ code: 403, error_code: 'PANEL_SESSION_REQUIRED' });
          const result = await action(
            service(),
            validate(id, req.params.worktreeId),
            validate(schema, method === 'get' ? req.query : req.body),
          );
          return res.send({ code: 200, data: result });
        } catch (e: any) {
          const error_code = /^[A-Z][A-Z0-9_]+$/.test(
            e.error_code || e.code || '',
          )
            ? e.error_code || e.code
            : 'WORKSPACE_OPERATION_FAILED';
          return res
            .status(e.status || 409)
            .send({ code: e.status || 409, error_code, message: error_code });
        }
      },
    );
  const page = {
    offset: Joi.number().integer().min(0).max(100000).default(0),
    limit: Joi.number().integer().min(1).max(1000).default(200),
  };
  route('get', '', Joi.object({}), (s, id) => s.info(id));
  route(
    'get',
    '/tree',
    Joi.object({ path: Joi.string().allow('').default(''), ...page }),
    (s, id, v) => s.tree(id, v.path, v.offset, v.limit),
  );
  route('get', '/files', Joi.object({ path: relative }), (s, id, v) =>
    s.read(id, v.path),
  );
  route(
    'get',
    '/search',
    Joi.object({
      query: Joi.string().min(1).max(256).required(),
      content: Joi.boolean().default(false),
    }),
    (s, id, v) => s.search(id, v.query, v.content),
  );
  route(
    'put',
    '/files',
    Joi.object({ path: relative, content, expected_hash: expected }),
    (s, id, v) => s.mutate(id, 'save', v),
  );
  route(
    'post',
    '/files',
    Joi.object({
      path: relative,
      content,
      must_not_exist: Joi.boolean().valid(true).required(),
    }),
    (s, id, v) => s.mutate(id, 'create', v),
  );
  route(
    'delete',
    '/files',
    Joi.object({ path: relative, expected_hash: expected }),
    (s, id, v) => s.mutate(id, 'remove', v),
  );
  route('post', '/directories', Joi.object({ path: relative }), (s, id, v) =>
    s.mutate(id, 'mkdir', v),
  );
  route(
    'post',
    '/rename',
    Joi.object({
      path: relative,
      destination: relative,
      expected_hash: expected,
    }),
    (s, id, v) => s.mutate(id, 'rename', v),
  );
  route('get', '/git/status', Joi.object(page), (s, id, v) =>
    s.status(id, v.offset, v.limit),
  );
  route(
    'get',
    '/git/diff',
    Joi.object({ path: relative, staged: Joi.boolean().default(false) }),
    (s, id, v) => s.diff(id, v.path, v.staged),
  );
  for (const name of ['stage', 'unstage'] as const)
    route(
      'post',
      '/git/' + name,
      Joi.object({
        paths: Joi.array().items(relative).min(1).max(200).required(),
      }),
      (s, id, v) => s.stage(id, v.paths, name === 'unstage'),
    );
  route(
    'put',
    '/git/identity',
    Joi.object({
      name: Joi.string().max(200).required(),
      email: Joi.string().max(254).required(),
    }),
    (s, _id, v) => s.setIdentity(v),
  );
  route(
    'post',
    '/git/commit',
    Joi.object({ message: Joi.string().max(8192).required() }),
    (s, id, v) => s.commit(id, v.message),
  );
  route(
    'post',
    '/git/push',
    Joi.object({ branch: Joi.string().max(255) }),
    (s, id, v) => s.push(id, v.branch),
  );
}
