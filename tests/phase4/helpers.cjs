const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { Sequelize, Transaction } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
require('reflect-metadata');
module.exports = async function setup(t) {
  const root = path.resolve(__dirname, '../..'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-env4-'));
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: t.fileDatabase ? path.join(dir, 'database.sqlite') : ':memory:', logging: false, transactionType: Transaction.TYPES.IMMEDIATE, retry: { max: 10, match: ['SQLITE_BUSY: database is locked'] } });
  const logs = [], logger = { info: (...args) => logs.push(args), error: (...args) => logs.push(args), warn: (...args) => logs.push(args) };
  const config = { rootPath: dir, dataPath: path.join(dir, 'data') };
  const mocks = { '.': { sequelize }, '../data': { sequelize }, '../config': config, '../loaders/logger': logger, '../shared/utils': { writeFileWithLock: async (f, s) => fs.writeFileSync(f, s) } };
  const cache = new Map(), get = f => load(path.join(root, 'back', f + '.ts'), mocks, cache);
  const models = Object.assign({}, ...['gitCredential', 'repository', 'worktree', 'subscription', 'cron', 'env', 'scopedEnv', 'configAsset', 'task', 'runtime', 'pythonEnvironment', 'nodeEnvironment'].map(f => get('data/' + f)));
  await sequelize.sync();
  require('../phase9/task-fixture.cjs')(models, sequelize, () => ({ scriptRoot: path.join(dir, 'data/scripts') }));
  const profiles = new (get('services/repositoryEnvProfile').default)();
  const variables = new (get('services/scopedEnvVariable').default)(profiles);
  const resolver = new (get('services/taskEnvironmentResolver').default)(profiles);
  t.after(async () => { await sequelize.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  // Scoped ENV fixtures use database-backed services, without legacy Shell/SDK files.
  const globals = new (get('services/env').default)(logger);
  return { root, dir, sequelize, get, config, ...models, profiles, variables, resolver, globals, logs };
};
