const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const load = require('../../test/helpers/load-security-module.cjs');
const { default: Resolver, runGitProcess } = load(
  'back/services/gitCredentialResolver.ts',
);
const { redactGitCredential } = load('back/shared/gitSecurity.ts');
const credential = {
  auth_type: 'https_token',
  status: 'enabled',
  capability: 'READ',
  username: 'tester',
};
test('redacts split output, authorization, URL, private material and encoded secrets', async () => {
  const secret = 'token-for-test-123';
  const c = await new Resolver().resolve(
    credential,
    { token: secret },
    'https://example.org/a/b.git',
  );
  try {
    const r = await runGitProcess(
      process.execPath,
      [
        '-e',
        `process.stdout.write('token-for-');setTimeout(()=>process.stdout.write('test-123'),20)`,
      ],
      c,
    );
    assert.equal(r.output.includes(secret), false);
    assert.equal(r.output, '***');
    for (const value of [
      secret,
      encodeURIComponent(secret),
      Buffer.from(secret).toString('base64'),
      'https://user:password@example.org/a',
      'Authorization: Bearer abc',
      '-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----',
    ])
      assert.equal(redactGitCredential(value, [secret]).includes(value), false);
  } finally {
    await c.cleanup();
  }
  await assert.rejects(fs.stat(c.directory));
});
test('concurrent HTTPS contexts have private immutable snapshots and idempotent cleanup', async () => {
  const resolver = new Resolver();
  const secret = { token: 'snapshot-token' };
  const [a, b] = await Promise.all([
    resolver.resolve(credential, secret, 'https://example.org/a/b'),
    resolver.resolve(credential, secret, 'https://example.org/a/b'),
  ]);
  try {
    assert.notEqual(a.directory, b.directory);
    secret.token = 'replacement';
    assert.equal(
      JSON.parse(await fs.readFile(path.join(a.directory, 'secret.json')))
        .token,
      'snapshot-token',
    );
    assert.equal(
      (await fs.stat(path.join(a.directory, 'secret.json'))).mode & 511,
      384,
    );
    assert.equal((await fs.stat(a.directory)).mode & 511, 448);
    assert.ok(!JSON.stringify(a.env).includes('snapshot-token'));
    const result = await runGitProcess(a.env.GIT_ASKPASS, ['Password'], a);
    assert.equal(result.output.includes('snapshot-token'), false);
  } finally {
    await Promise.all([a.cleanup(), b.cleanup()]);
    await a.cleanup();
  }
});
test('SSH contexts isolate keys and require verified known_hosts', async () => {
  const r = new Resolver(),
    c = {
      ...credential,
      auth_type: 'ssh_key',
      known_hosts: 'example.org ssh-ed25519 AAAATEST',
    };
  await assert.rejects(
    r.resolve(
      { ...c, known_hosts: '' },
      { private_key: 'key' },
      'git@example.org:a/b',
    ),
    /known_hosts/,
  );
  const contexts = await Promise.all([
    r.resolve(c, { private_key: 'private material' }, 'git@example.org:a/b'),
    r.resolve(c, { private_key: 'private material' }, 'git@example.org:a/b'),
  ]);
  try {
    assert.notEqual(contexts[0].directory, contexts[1].directory);
    for (const ctx of contexts) {
      assert.match(ctx.env.GIT_SSH_COMMAND, /StrictHostKeyChecking=yes/);
      assert.equal(
        (await fs.stat(path.join(ctx.directory, 'identity'))).mode & 511,
        384,
      );
    }
  } finally {
    await Promise.all(contexts.map((c) => c.cleanup()));
  }
});
test('disabled, missing, wrong transport and READ push fail closed', async () => {
  const r = new Resolver();
  await assert.rejects(
    r.resolve(
      { ...credential, status: 'disabled' },
      { token: 'x' },
      'https://example.org/a/b',
    ),
    /disabled/,
  );
  await assert.rejects(
    r.resolve(credential, {}, 'https://example.org/a/b'),
    /missing/,
  );
  await assert.rejects(
    r.resolve(credential, { token: 'x' }, 'git@example.org:a/b'),
    /transport/,
  );
  await assert.rejects(
    r.resolve(credential, { token: 'x' }, 'https://example.org/a/b', 'push'),
    /push/,
  );
});
test('bounded output cannot leak a partial secret at truncation boundary; timeout terminates', async () => {
  const c = await new Resolver().resolve(null, {}, 'https://example.org/a/b');
  c.secrets = ['truncated-secret'];
  try {
    const large = await runGitProcess(
      process.execPath,
      [
        '-e',
        `process.stdout.write('a'.repeat(4*1024*1024)+'truncated-');setTimeout(()=>process.stdout.write('secret'),20)`,
      ],
      c,
    );
    assert.equal(large.output.includes('truncated-'), false);
    const timeout = await runGitProcess(
      process.execPath,
      ['-e', 'setInterval(()=>{},1000)'],
      c,
      50,
    );
    assert.equal(timeout.code, 124);
  } finally {
    await c.cleanup();
  }
});
test('timeout terminates a child process group before credential cleanup', async () => {
  const c = await new Resolver().resolve(null, {}, 'https://example.org/a/b');
  try {
    const script = `const cp=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000);`;
    const started = Date.now();
    const result = await runGitProcess(
      process.execPath,
      ['-e', script],
      c,
      150,
    );
    assert.equal(result.code, 124);
    assert.ok(
      Date.now() - started < 3000,
      'inherited pipes closed after descendant termination',
    );
  } finally {
    await c.cleanup();
  }
});
