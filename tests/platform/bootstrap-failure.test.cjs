const assert=require('node:assert/strict'),test=require('node:test'),path=require('node:path'),load=require('../../test/helpers/load-security-module.cjs');
test('database loader rejects initialization failure rather than allowing workers to start', async () => {
  const mocks = { './logger': { error() {}, info() {} } };
  for (const [file, model] of [
    ['env', 'EnvModel'],
    ['cron', 'CrontabModel'],
    ['dependence', 'DependenceModel'],
    ['open', 'AppModel'],
    ['system', 'SystemModel'],
    ['subscription', 'SubscriptionModel'],
    ['cronView', 'CrontabViewModel'],
    ['cronStats', 'CrontabStatModel'],
    ['runningInstance', 'RunningInstanceModel'],
  ])
    mocks[`../data/${file}`] = { [model]: { sync: async () => {} } };
  for (const [file, model] of [['gitCredential','GitCredentialModel'],['repository','RepositoryModel'],['worktree','WorktreeModel']])
    mocks[`../data/${file}`] = { [model]: {} };
  mocks['../data/scopedEnv'] = { EnvironmentProfileModel: {}, RepositoryEnvVariableModel: {}, TaskEnvVariableModel: {} };
  mocks['../config'] = { dataPath: '/unused' };
  mocks['../shared/bootstrapDirectories'] = { bootstrapDirectories: async () => {} };
  mocks['../data'] = { sequelize: {} };
  mocks['../shared/operationalSchema'] = {
    initializeOperationalSchema: async () => {
      throw new Error('SQLITE_FULL');
    },
  };
  const initialize = load(path.resolve('back/loaders/db.ts'), mocks).default;
  await assert.rejects(initialize(), /SQLITE_FULL/);
});
