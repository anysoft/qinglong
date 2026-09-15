const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const load = require('../../test/helpers/load-security-module.cjs');
test('Git resource HTTP boundary never reflects submitted secrets or internal errors; routes are read/write specific', async (t) => {
  const calls = [];
  const secret = 'http-secret-never-reflect';
  class Credentials {}
  class Repositories {}
  class Subs {}
  class Subscription {}
  const services = new Map([
    [
      Credentials,
      {
        list: async () => [{ id: 1, name: 'test', has_secret: true }],
        detail: async () => ({ id: 1, has_secret: true }),
        save: async (body) => {
          calls.push(body);
          throw new Error(secret);
        },
        remove: async () => {
          throw new Error(secret);
        },
        testAccess: async (id, url) => {
          calls.push({ id, url });
          return { status: 'available' };
        },
      },
    ],
    [
      Repositories,
      {
        list: async () => [],
        testAccess: async () => ({ status: 'available' }),
      },
    ],
    [Subs, {}],
    [Subscription, {}],
  ]);
  const register = load('back/api/gitResources.ts', {
    typedi: { Container: { get: (key) => services.get(key) } },
    '../services/gitCredential': Credentials,
    '../services/repository': Repositories,
    '../services/subscriptionGit': Subs,
    '../services/subscription': Subscription,
  }).default;
  const app = express();
  app.use(express.json());
  register(app);
  app.use(
    '/open',
    ((router) => {
      register(router);
      return router;
    })(express.Router()),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (route, method = 'GET', body) => {
    const r = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await r.text();
    assert.equal(text.includes(secret), false);
    return { status: r.status, body: JSON.parse(text) };
  };
  assert.equal(
    (await request('/git-credentials')).body.data[0].has_secret,
    true,
  );
  assert.equal((await request('/open/git-credentials')).status, 403);
  assert.equal(
    (
      await request('/git-credentials', 'POST', {
        name: 'credential',
        provider: 'generic',
        auth_type: 'https_token',
        token: secret,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/git-credentials', 'POST', {
        token: secret,
        unexpected: secret,
      })
    ).status,
    400,
  );
  assert.equal((await request('/git-credentials/' + secret)).status, 400);
  assert.equal(
    (
      await request('/repositories/normalize', 'POST', {
        remote_url: `https://user:${secret}@example.org/a/b`,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/git-credentials/1/test', 'POST', {
        remote_url: 'https://example.org/a/b',
      })
    ).body.data.status,
    'available',
  );
  assert.equal(calls.at(-1).url, 'https://example.org/a/b');
});
