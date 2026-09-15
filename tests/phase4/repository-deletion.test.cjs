const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const setup = require('../phase2/helpers.cjs');
test('profile references block repository filesystem deletion before mutation', async t => {
  const h = await setup(t); await h.storage.initialize(h.repo.id);
  const ProfileService = require('../../test/helpers/load-security-module.cjs')('back/services/repositoryEnvProfile.ts', {
    '../loaders/logger': { info() {}, warn() {}, error() {} }, '../data': { sequelize: h.sequelize },
    '../data/scopedEnv': h, '../data/repository': h, '../data/subscription': h, '../data/cron': h,
  }).default;
  const profiles = new ProfileService();
  const profile = await profiles.save({ repository_id: h.repo.id, name: 'prod' });
  const before = await h.repositories.get(h.repo.id);
  await assert.rejects(h.storage.remove(h.repo.id), e => e.error_code === 'REPOSITORY_IN_USE');
  assert.ok(fs.existsSync(before.storage_path)); assert.equal((await h.repositories.get(h.repo.id)).storage_state, 'READY');
  await profiles.remove(profile.id); await h.RepositoryModel.update({ storage_state: 'DELETING' }, { where: { id: h.repo.id } });
  await assert.rejects(profiles.save({ repository_id: h.repo.id, name: 'racing-create' }), /ENV_REPOSITORY_DELETING/);
});
