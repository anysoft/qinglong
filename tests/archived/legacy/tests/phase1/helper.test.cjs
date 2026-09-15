const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('../../test/helpers/load-security-module.cjs');
function helper({ cancel = false, fail = false } = {}) {
  let cleaned = 0,
    command;
  class SubResolver {}
  class Secret {}
  class Resolver {}
  const row = {
    id: 7,
    branch: 'dev',
    whitelist: 'py',
    autoAddCron: 0,
    autoDelCron: 1,
    get() {
      return this;
    },
  };
  const context = {
    env: {},
    remote: 'https://example.org/a/b.git',
    cleanup: async () => {
      cleaned++;
    },
  };
  const services = new Map([
    [
      SubResolver,
      {
        resolveSubscriptionGitContext: async () => ({
          remoteUrl: context.remote,
          legacyMode: false,
          credential: { id: 2 },
        }),
      },
    ],
    [Secret, { getCredentialSecret: async () => ({ token: 'never-in-args' }) }],
    [
      Resolver,
      {
        resolve: async () => {
          if (cancel) process.emit('SIGTERM');
          return context;
        },
      },
    ],
  ]);
  const run = load('back/gitSubscription.ts', {
    typedi: { Container: { get: (key) => services.get(key) } },
    './config': { rootPath: '/isolated/ql' },
    './data': { sequelize: {} },
    './data/subscription': { SubscriptionModel: { findByPk: async () => row } },
    './services/subscriptionGit': SubResolver,
    './services/credentialSecret': Secret,
    './services/gitCredentialResolver': {
      __esModule: true,
      default: Resolver,
      terminateGitProcess() {},
      runGitProcess: async (executable, args, c) => {
        command = { executable, args, env: c.env };
        if (fail) throw new Error('spawn failed');
        return { code: 0, output: '' };
      },
    },
  }).runRepositorySubscription;
  return { run, cleaned: () => cleaned, command: () => command };
}
test('internal helper resolves resources at execution and passes unchanged positional repo contract', async () => {
  const h = helper();
  assert.equal(await h.run(7), 0);
  assert.deepEqual(h.command().args, [
    '/isolated/ql/shell/update.sh',
    'repo',
    'https://example.org/a/b.git',
    'py',
    '',
    '',
    'dev',
    '',
    '',
    'false',
    'true',
  ]);
  assert.equal(h.command().env.SUB_ID, '7');
  assert.equal(JSON.stringify(h.command()).includes('never-in-args'), false);
  assert.equal(h.cleaned(), 1);
});
test('internal helper cleans credentials on subprocess failure and initialization-time cancellation', async () => {
  const failed = helper({ fail: true });
  await assert.rejects(failed.run(7));
  assert.equal(failed.cleaned(), 1);
  const cancelled = helper({ cancel: true });
  assert.equal(await cancelled.run(7), 130);
  assert.equal(cancelled.command(), undefined);
  assert.equal(cancelled.cleaned(), 1);
});
