const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { execFileSync } = require('node:child_process');
const { Sequelize, Transaction } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
require('reflect-metadata');
module.exports = async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-workspace2-'));
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
    '../config': { rootPath: root, dataPath: dir },
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
  };
  await sequelize.sync();
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
