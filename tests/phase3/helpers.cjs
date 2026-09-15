const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { execFileSync } = require('node:child_process');
const { Sequelize, Transaction } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
require('reflect-metadata');
module.exports = async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-managed3-'));
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    transactionType: Transaction.TYPES.IMMEDIATE,
  });
  t.after(async () => {
    await sequelize.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const root = path.resolve(__dirname, '../..'),
    origin = path.join(dir, 'origin');
  await fs.mkdir(origin);
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: origin,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  await fs.writeFile(path.join(origin, 'file.txt'), 'initial\n');
  git('add', '.');
  git('commit', '-qm', 'initial');
  git('branch', 'dev');
  git('tag', 'v1');
  const mocks = {
    '.': { sequelize },
    '../data': { sequelize },
    '../config': {
      rootPath: root,
      dataPath: dir,
      scriptPath: path.join(dir, 'scripts'),
      logPath: path.join(dir, 'log'),
      crontabFile: path.join(dir, 'config/crontab.list'),
      jwt: { secret: 'fixture' },
    },
    '../config/util': {
      fileExist: async (f) => {
        try {
          await fs.access(f);
          return true;
        } catch {
          return false;
        }
      },
      getUniqPath: async (_command, id) => id || 'managed',
      isDemoEnv: () => false,
      safeJSONParse: (value) => {
        try {
          return JSON.parse(value);
        } catch {
          return {};
        }
      },
    },
    './notify': class {
      async notify() {}
    },
    './schedule': class {},
    './sock': class {},
    './sshKey': class {},
    '../shared/pLimit': {},
    '../shared/i18n': { t: (x) => x },
    '../schedule/client': { addCron: async () => {}, delCron: async () => {} },
  };
  const cache = new Map(),
    get = (f) => load(path.join(root, 'back', f + '.ts'), mocks, cache);
  const Models = {
    ...get('data/gitCredential'),
    ...get('data/repository'),
    ...get('data/worktree'),
    ...get('data/subscription'),
    ...get('data/cron'),
    ...get('data/scopedEnv'),
    ...get('data/configAsset'),
  };
  await sequelize.sync();
  for (const folder of ['scripts', 'config', 'log', 'deps'])
    await fs.mkdir(path.join(dir, folder));
  await fs.writeFile(
    path.join(dir, 'config/config.sh'),
    "DefaultCronRule='0 0 * * *'\n",
  );
  await fs.writeFile(path.join(dir, 'config/crontab.list'), '');
  for (const file of ['sendNotify.js', 'notify.py'])
    await fs.writeFile(path.join(dir, 'scripts', file), '');
  const BaseResolver = get('services/gitCredentialResolver').default,
    seen = [];
  class FixtureResolver extends BaseResolver {
    async resolve(c, s, remote, ...rest) {
      seen.push(c?.id || null);
      const context = await super.resolve(c, s, remote, ...rest);
      if (
        remote.startsWith('https://fixture.invalid/') ||
        remote.startsWith('ssh://git@fixture.invalid/')
      ) {
        context.env.GIT_ALLOW_PROTOCOL = 'file:https:ssh';
        context.env.GIT_CONFIG_COUNT = '3';
        context.env.GIT_CONFIG_KEY_2 = `url.file://${origin}.insteadOf`;
        context.env.GIT_CONFIG_VALUE_2 = remote;
      }
      return context;
    }
  }
  const secrets = new (get('services/credentialSecret').default)(),
    resolver = new FixtureResolver();
  const repositories = new (get('services/repository').default)(
      secrets,
      resolver,
    ),
    credentials = new (get('services/gitCredential').default)(
      secrets,
      resolver,
    );
  const commands = new (get('services/gitCommand').default)(secrets, resolver),
    storage = new (get('services/repositoryStorage').default)(commands),
    worktrees = new (get('services/worktree').default)(storage);
  const repo = await repositories.save({
    remote_url: 'https://fixture.invalid/team/project.git',
    name: 'Fixture',
  });
  return {
    dir,
    root,
    origin,
    git,
    sequelize,
    get,
    ...Models,
    repositories,
    credentials,
    commands,
    storage,
    worktrees,
    repo,
    seen,
    mocks,
    local: (cwd, ...args) =>
      execFileSync(
        'git',
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.invalid',
          ...args,
        ],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ).trim(),
  };
};
