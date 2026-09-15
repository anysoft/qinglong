const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('../../test/helpers/load-security-module.cjs');
const path = require('node:path');
const { normalizeRepositoryUrl } = load(
  path.resolve('back/shared/gitProvider.ts'),
);
for (const remote of [
  'https://github.com/anysoft/test.git',
  'https://GITHUB.COM/anysoft/test',
  'git@github.com:anysoft/test.git',
  'ssh://git@github.com/anysoft/test.git',
]) {
  test(`same GitHub identity: ${remote}`, () =>
    assert.equal(
      normalizeRepositoryUrl(remote).normalized_url,
      'github.com/anysoft/test',
    ));
}
for (const host of ['gitlab.com', 'gitee.com', 'git.example.internal']) {
  test(`provider neutral nested identity: ${host}`, () => {
    const result = normalizeRepositoryUrl(
      `https://${host}/Team/a/b/Project.git/`,
    );
    assert.equal(result.path, 'Team/a/b/Project');
    assert.equal(result.host, host);
  });
}
test('generic paths remain case sensitive and nondefault ports distinct', () => {
  assert.notEqual(
    normalizeRepositoryUrl('https://example.test/Team/R').normalized_url,
    normalizeRepositoryUrl('https://example.test/team/r').normalized_url,
  );
  assert.notEqual(
    normalizeRepositoryUrl('ssh://git@example.test:2222/a/r').normalized_url,
    normalizeRepositoryUrl('ssh://git@example.test/a/r').normalized_url,
  );
});
for (const remote of [
  'https://user:secret@example.test/a/r',
  'https://token@example.test/a/r',
  'file:///tmp/r',
  'ext::sh -c x',
  'https://example.test/a/../r',
  'https://example.test/a/r?token=x',
  'https://example.test/a/%2e%2e/r',
]) {
  test('reject unsafe or credentialized URL without reflecting input', () => {
    assert.throws(
      () => normalizeRepositoryUrl(remote),
      (e) =>
        !e.message.includes(remote) && /Invalid|credentials/.test(e.message),
    );
  });
}
