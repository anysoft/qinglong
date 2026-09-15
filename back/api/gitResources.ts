import { Router, Request, Response } from 'express';
import { Container } from 'typedi';
import GitCredentialService from '../services/gitCredential';
import RepositoryService from '../services/repository';
import SubscriptionGitResolver from '../services/subscriptionGit';
import SubscriptionService from '../services/subscription';
import { normalizeRepositoryUrl } from '../shared/gitProvider';
import { GitResourceError } from '../shared/gitSecurity';
import { Joi } from 'celebrate';

const idSchema = Joi.number().integer().positive().required();
const nullableId = Joi.number().integer().positive().allow(null);
const text = Joi.string().max(65536).allow('');
const credentialSchema = Joi.object({
  id: idSchema.optional(),
  name: Joi.string().trim().max(255),
  provider: Joi.string().valid('github', 'gitlab', 'gitee', 'generic'),
  auth_type: Joi.string().valid('anonymous', 'https_token', 'ssh_key'),
  username: Joi.string()
    .max(255)
    .pattern(/^[^\r\n\0]*$/)
    .allow(''),
  token: text,
  private_key: text,
  passphrase: text,
  known_hosts: text,
  capability: Joi.string().valid('READ', 'WRITE'),
  status: Joi.string().valid('enabled', 'disabled'),
  replace_secret: Joi.boolean(),
});
const repositorySchema = Joi.object({
  id: idSchema.optional(),
  name: Joi.string().trim().max(255),
  remote_url: Joi.string().max(4096),
  default_credential_id: nullableId,
});
function validate(schema: any, value: unknown) {
  const result = schema.validate(value);
  // Never return Joi details: they can contain submitted credential material.
  if (result.error) throw new GitResourceError('Invalid Git resource request');
  return result.value;
}
function endpoint(action: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      if (/^\/open\//i.test(req.originalUrl))
        throw new GitResourceError(
          'Git resources require a panel session',
          403,
        );
      return res.send({ code: 200, data: await action(req) });
    } catch (error) {
      const status = error instanceof GitResourceError ? error.status : 400;
      return res
        .status(status)
        .send({
          code: status,
          message:
            error instanceof GitResourceError
              ? error.message
              : 'Git resource operation failed',
        });
    }
  };
}
export default function gitResources(app: Router) {
  const credentials = Router(),
    repositories = Router();
  app.use('/git-credentials', credentials);
  app.use('/repositories', repositories);
  credentials.get(
    '/',
    endpoint(async () => Container.get(GitCredentialService).list()),
  );
  credentials.get(
    '/:id',
    endpoint(async (req) =>
      Container.get(GitCredentialService).detail(
        validate(idSchema, req.params.id),
      ),
    ),
  );
  credentials.post(
    '/',
    endpoint(async (req) => {
      const input = validate(credentialSchema, req.body);
      delete input.id;
      return Container.get(GitCredentialService).save(input);
    }),
  );
  credentials.put(
    '/',
    endpoint(async (req) => {
      const input = validate(credentialSchema, req.body);
      validate(idSchema, input.id);
      return Container.get(GitCredentialService).save(input);
    }),
  );
  credentials.delete(
    '/:id',
    endpoint(async (req) => {
      await Container.get(GitCredentialService).remove(
        validate(idSchema, req.params.id),
      );
      return null;
    }),
  );
  credentials.post(
    '/:id/test',
    endpoint(async (req) =>
      Container.get(GitCredentialService).testAccess(
        validate(idSchema, req.params.id),
        validate(
          Joi.object({ remote_url: Joi.string().max(4096).required() }),
          req.body,
        ).remote_url,
      ),
    ),
  );
  repositories.post(
    '/normalize',
    endpoint(async (req) =>
      normalizeRepositoryUrl(
        validate(
          Joi.object({ remote_url: Joi.string().max(4096).required() }),
          req.body,
        ).remote_url,
      ),
    ),
  );
  repositories.get(
    '/',
    endpoint(async () => Container.get(RepositoryService).list()),
  );
  repositories.get(
    '/:id',
    endpoint(async (req) =>
      Container.get(RepositoryService).detail(
        validate(idSchema, req.params.id),
      ),
    ),
  );
  repositories.post(
    '/',
    endpoint(async (req) => {
      const input = validate(repositorySchema, req.body);
      delete input.id;
      return Container.get(RepositoryService).save(input);
    }),
  );
  repositories.put(
    '/',
    endpoint(async (req) => {
      const input = validate(repositorySchema, req.body);
      validate(idSchema, input.id);
      return Container.get(RepositoryService).save(input);
    }),
  );
  repositories.delete(
    '/:id',
    endpoint(async (req) => {
      await Container.get(RepositoryService).remove(
        validate(idSchema, req.params.id),
      );
      return null;
    }),
  );
  repositories.post(
    '/:id/test',
    endpoint(async (req) =>
      Container.get(RepositoryService).testAccess(
        validate(idSchema, req.params.id),
      ),
    ),
  );
  app.post(
    '/subscriptions/:id/convert',
    endpoint(async (req) => {
      const input = validate(
        Joi.object({ credential_id: nullableId }),
        req.body,
      );
      const resolver = Container.get(SubscriptionGitResolver);
      const data = await resolver.convert(
        validate(idSchema, req.params.id),
        input.credential_id,
      );
      // Registration only: conversion never runs the subscription or touches scripts.
      await Container.get(SubscriptionService).handleTask(
        data,
        !data.is_disabled,
      );
      return { subscription: data, warnings: await resolver.collisions(data) };
    }),
  );
}
