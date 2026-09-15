const test = require('node:test'),
  assert = require('node:assert/strict'),
  express = require('express');
const setup = require('./helpers.cjs');
const { Container } = require('typedi');
test('workspace HTTP API rejects paths/force/ref injection and preserves operation error codes', async (t) => {
  const x = await setup(t);
  const Storage = x.get('services/repositoryStorage').default,
    Worktree = x.get('services/worktree').default;
  Container.set(Storage, x.storage);
  Container.set(Worktree, x.worktrees);
  t.after(() => Container.reset());
  const app = express();
  app.use(express.json());
  x.get('api/workspace').default(app);
  app.use(
    '/open',
    ((r) => {
      x.get('api/workspace').default(r);
      return r;
    })(express.Router()),
  );
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (url, method = 'GET', body) => {
    const response = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  };
  const input = {
    repository_id: x.repo.id,
    name: 'main',
    ref_type: 'branch',
    ref_name: 'main',
  };
  assert.equal(
    (
      await request('/worktrees', 'POST', {
        ...input,
        local_path: '/tmp/unsafe',
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(`/repositories/${x.repo.id}/initialize`, 'POST', {})).status,
    200,
  );
  assert.equal(
    (await request('/worktrees', 'POST', { ...input, ref_name: '--exec=bad' }))
      .body.error_code,
    'INVALID_REF',
  );
  const created = await request('/worktrees', 'POST', input);
  assert.equal(created.status, 200);
  const id = created.body.data.id;
  assert.equal(
    (await request(`/worktrees/${id}/update`, 'POST', { force: true })).status,
    400,
  );
  assert.equal(
    (await request(`/repositories/${x.repo.id}`, 'DELETE')).body.error_code,
    'REPOSITORY_IN_USE',
  );
  assert.equal((await request(`/open/worktrees/${id}`)).status, 403);
  assert.equal((await request(`/worktrees/${id}`, 'DELETE')).status, 200);
});
