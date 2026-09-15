const test = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize, Transaction } = require('sequelize');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const load = require('../../test/helpers/load-security-module.cjs');
require('reflect-metadata');
async function setup(t) {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    transactionType: Transaction.TYPES.IMMEDIATE,
  });
  t.after(() => sequelize.close());
  const cache = new Map();
  const mocks = { '.': { sequelize }, '../data': { sequelize } };
  const get = (file) => load('back/' + file + '.ts', mocks, cache);
  const { GitCredentialModel } = get('data/gitCredential');
  const { RepositoryModel } = get('data/repository');
  const { SubscriptionModel } = get('data/subscription');
  get('data/worktree'); // Subscription now has a nullable Worktree foreign key.
  await sequelize.sync();
  const Secret = get('services/credentialSecret').default,
    Resolver = get('services/gitCredentialResolver').default;
  const secrets = new Secret(),
    resolver = new Resolver();
  const credentials = new (get('services/gitCredential').default)(
      secrets,
      resolver,
    ),
    repositories = new (get('services/repository').default)(secrets, resolver),
    subs = new (get('services/subscriptionGit').default)();
  return {
    sequelize,
    get,
    credentials,
    repositories,
    subs,
    secrets,
    GitCredentialModel,
    RepositoryModel,
    SubscriptionModel,
  };
}
const tokenInput = {
  name: 'token',
  provider: 'github',
  auth_type: 'https_token',
  token: 'ghp_test-secret-do-not-leak',
};
test('A/B/D/H/I: stable identity, reusable credentials, secret replacement and deletion protection', async (t) => {
  const x = await setup(t);
  const c = await x.credentials.save(tokenInput);
  assert.equal(c.has_secret, true);
  assert.equal(JSON.stringify(c).includes(tokenInput.token), false);
  assert.equal('secret' in c, false);
  const a = await x.repositories.save({
    remote_url: 'https://github.com/anysoft/extend-vps-exp.git',
  });
  assert.equal(a.default_credential_id, null);
  const b = await x.repositories.save({
    remote_url: 'https://github.com/anysoft/test.git',
    default_credential_id: c.id,
  });
  const d = await x.repositories.save({
    remote_url: 'https://gitlab.com/team/other.git',
    default_credential_id: c.id,
  });
  await assert.rejects(
    x.repositories.save({ remote_url: 'git@github.com:anysoft/test.git' }),
    /already exists/,
  );
  await assert.rejects(
    x.repositories.save({
      remote_url: 'https://user:TOPSECRET@github.com/a/b',
    }),
    (e) => !e.message.includes('TOPSECRET'),
  );
  assert.equal((await x.credentials.detail(c.id)).used_by.repositories, 2);
  await assert.rejects(x.credentials.remove(c.id), /in use/);
  await x.credentials.save({ id: c.id, name: 'renamed' });
  assert.equal(
    (await x.secrets.getCredentialSecret(c.id)).token,
    tokenInput.token,
  );
  await x.credentials.save({
    id: c.id,
    replace_secret: true,
    token: 'replacement',
  });
  assert.equal((await x.repositories.get(b.id)).default_credential_id, c.id);
  assert.equal((await x.repositories.get(d.id)).default_credential_id, c.id);
  assert.equal(
    JSON.stringify(await x.credentials.list()).includes('replacement'),
    false,
  );
  const renamed = await x.repositories.save({ id: b.id, name: 'new display' });
  assert.equal(renamed.normalized_url, b.normalized_url);
  await assert.rejects(
    x.repositories.save({
      id: b.id,
      remote_url: 'https://github.com/anysoft/new.git',
    }),
    /immutable/,
  );
  await x.repositories.remove(b.id);
  await x.repositories.remove(d.id);
  await x.credentials.remove(c.id);
});
test('resolution priority, nullable legacy fallback, disabled and missing credentials', async (t) => {
  const x = await setup(t);
  const a = await x.credentials.save(tokenInput),
    b = await x.credentials.save({ ...tokenInput, name: 'override' });
  const r = await x.repositories.save({
    remote_url: 'https://github.com/a/b.git',
    default_credential_id: a.id,
  });
  const base = { repository_id: r.id, type: 'public-repo', branch: 'main' };
  assert.equal(
    (
      await x.subs.resolveSubscriptionGitContext({
        ...base,
        credential_id: b.id,
      })
    ).credential.id,
    b.id,
  );
  assert.equal(
    (await x.subs.resolveSubscriptionGitContext(base)).credential.id,
    a.id,
  );
  await x.repositories.save({ id: r.id, default_credential_id: null });
  assert.equal(
    (await x.subs.resolveSubscriptionGitContext(base)).credential,
    null,
  );
  assert.equal(
    (await x.subs.resolveSubscriptionGitContext({ url: 'legacy://unchanged' }))
      .remoteUrl,
    'legacy://unchanged',
  );
  await x.credentials.save({ id: b.id, status: 'disabled' });
  await assert.rejects(
    x.subs.resolveSubscriptionGitContext({ ...base, credential_id: b.id }),
    /disabled/,
  );
  await assert.rejects(
    x.subs.resolveSubscriptionGitContext({ ...base, credential_id: 999 }),
    /not found/,
  );
  await assert.rejects(
    x.subs.resolveSubscriptionGitContext({ ...base, branch: '../../outside' }),
    /Branch/,
  );
  await assert.rejects(
    x.credentials.save({ ...tokenInput, name: 'invalid', token: '' }),
    /valid token/,
  );
});
test('manual conversion deduplicates equivalent URLs and preserves legacy fields; warns collisions', async (t) => {
  const x = await setup(t);
  const legacy = {
    name: 'first',
    type: 'public-repo',
    url: 'https://github.com/a/b.git',
    branch: 'main',
    alias: 'original_alias',
    pull_option: { unchanged: true },
  };
  const a = await x.SubscriptionModel.create(legacy),
    b = await x.SubscriptionModel.create({
      ...legacy,
      name: 'second',
      alias: 'second_alias',
      url: 'git@github.com:a/b.git',
    }),
    dev = await x.SubscriptionModel.create({
      ...legacy,
      name: 'dev',
      alias: 'dev_alias',
      branch: 'dev',
    });
  assert.equal(a.repository_id, undefined);
  const ca = await x.subs.convert(a.id),
    cb = await x.subs.convert(b.id),
    cd = await x.subs.convert(dev.id);
  assert.equal(ca.repository_id, cb.repository_id);
  assert.equal(cd.repository_id, ca.repository_id);
  assert.equal(ca.alias, legacy.alias);
  assert.equal(cb.url, 'git@github.com:a/b.git');
  assert.equal(ca.branch, 'main');
  assert.deepEqual(ca.pull_option, legacy.pull_option);
  assert.equal(cd.branch, 'dev');
  const warnings = await x.subs.collisions(ca);
  assert.deepEqual(warnings[0].subscription_ids, [b.id]);
  await assert.rejects(x.repositories.remove(ca.repository_id), /in use/);
  const c = await x.credentials.save(tokenInput);
  await a.update({ credential_id: c.id });
  await assert.rejects(x.credentials.remove(c.id), /in use/);
});
test('C: encrypted SSH key validation derives public key, preserves secret privacy and supports reuse', async (t) => {
  const x = await setup(t);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-key-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const key = path.join(dir, 'key');
  execFileSync('ssh-keygen', [
    '-q',
    '-t',
    'ed25519',
    '-N',
    'test-passphrase',
    '-C',
    'user@host with comment',
    '-f',
    key,
  ]);
  const private_key = await fs.readFile(key, 'utf8');
  const c = await x.credentials.save({
    name: 'ssh',
    provider: 'generic',
    auth_type: 'ssh_key',
    private_key,
    passphrase: 'test-passphrase',
    known_hosts: 'example.org ssh-ed25519 AAAATEST',
  });
  assert.match(c.public_key, /^ssh-ed25519 /);
  assert.match(c.fingerprint, /^SHA256:/);
  const response = JSON.stringify(c);
  assert.equal(response.includes(private_key), false);
  assert.equal(response.includes('test-passphrase'), false);
  for (const name of ['a', 'b'])
    await x.repositories.save({
      remote_url: `git@example.org:team/${name}.git`,
      default_credential_id: c.id,
    });
  assert.equal((await x.credentials.detail(c.id)).used_by.repositories, 2);
  await assert.rejects(
    x.credentials.save({
      id: c.id,
      replace_secret: true,
      private_key,
      passphrase: 'incorrect',
    }),
    /Invalid SSH/,
  );
  assert.equal(
    (await x.secrets.getCredentialSecret(c.id)).passphrase,
    'test-passphrase',
  );
});

test('access tests use only ls-remote, update status, hide remote errors and clean contexts', async t => {
  const x = await setup(t), calls = [];
  const module = x.get('services/gitCredentialResolver');
  module.runGitProcess = async (executable,args,context) => { calls.push({executable,args,directory:context.directory});return {code:128,output:tokenInput.token}; };
  const credential = await x.credentials.save(tokenInput);
  const repository = await x.repositories.save({remote_url:'https://github.com/a/b.git',default_credential_id:credential.id});
  for (const response of [await x.credentials.testAccess(credential.id, repository.remote_url),await x.repositories.testAccess(repository.id)]) {assert.equal(response.status,'unreachable');assert.equal(JSON.stringify(response).includes(tokenInput.token),false);}
  for (const call of calls) {assert.equal(call.executable,'git');assert.deepEqual(call.args,['ls-remote','--',repository.remote_url]);await assert.rejects(fs.stat(call.directory));}
  assert.equal((await x.repositories.get(repository.id)).status,'unreachable');assert.equal((await x.credentials.get(credential.id)).last_test_result,'unreachable');
  assert.equal(await x.SubscriptionModel.count(),0);
});

test('credential update does not mutate the snapshot of a running invocation', async t => {
  const x=await setup(t);const credential=await x.credentials.save(tokenInput);
  const Resolver=x.get('services/gitCredentialResolver').default;const resolver=new Resolver();
  const before=await resolver.resolve(credential,await x.secrets.getCredentialSecret(credential.id),'https://github.com/a/b.git');
  try {await x.credentials.save({id:credential.id,replace_secret:true,token:'updated-token'});
    const after=await resolver.resolve(await x.credentials.get(credential.id),await x.secrets.getCredentialSecret(credential.id),'https://github.com/a/b.git');
    try{assert.notEqual(before.directory,after.directory);assert.equal(JSON.parse(await fs.readFile(path.join(before.directory,'secret.json'))).token,tokenInput.token);assert.equal(JSON.parse(await fs.readFile(path.join(after.directory,'secret.json'))).token,'updated-token');}finally{await after.cleanup();}
  }finally{await before.cleanup();}
});
