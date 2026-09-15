const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const load = require('../../test/helpers/load-security-module.cjs');
const { default: Resolver, runGitProcess } = load(
  'back/services/gitCredentialResolver.ts',
);
const root = path.resolve(__dirname, '../..');
test('F/G/J: authenticated HTTPS-like fixture uses unchanged update.sh, shallow destructive branch clones, copy and task discovery', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-phase1-pipeline-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'shell'), path.join(dir, 'shell'), {
    recursive: true,
  });
  fs.cpSync(path.join(root, 'fixtures/test-repo'), path.join(dir, 'origin'), {
    recursive: true,
  });
  fs.cpSync(path.join(root, 'sample'), path.join(dir, 'sample'), {
    recursive: true,
  });
  for (const d of ['config', 'scripts', 'repo', 'log/.tmp'])
    fs.mkdirSync(path.join(dir, 'data', d), { recursive: true });
  fs.mkdirSync(path.join(dir, 'bin'));
  for (const f of ['config.sh', 'crontab.list'])
    fs.writeFileSync(path.join(dir, 'data/config', f), '');
  fs.writeFileSync(
    path.join(dir, 'shell/api.sh'),
    `add_cron_api() { printf '%s\\n' "$1" >> "$QL_DIR/created"; }\ndel_cron_api() { :; }\nnotify_api() { :; }\nupdate_cron() { :; }\n`,
  );
  const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  const git = (...args) =>
    execFileSync(realGit, args, {
      cwd: path.join(dir, 'origin'),
      stdio: 'pipe',
    });
  git('init', '-b', 'main');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Fixture');
  git('add', '.');
  git('commit', '-qm', 'main');
  git('checkout', '-b', 'dev');
  fs.writeFileSync(path.join(dir, 'origin/dev.txt'), 'dev');
  git('add', '.');
  git('commit', '-qm', 'dev');
  // Transport boundary only is mocked: actual git clone, update.sh, scanner and copies run.
  const wrapper = path.join(dir, 'bin/git');
  fs.writeFileSync(
    wrapper,
    `#!${
      process.execPath
    }\nconst fs=require('fs'),cp=require('child_process');const args=process.argv.slice(2);fs.appendFileSync(process.env.QL_DIR+'/git-argv',JSON.stringify(args)+'\\n');const token=cp.execFileSync(process.env.GIT_ASKPASS,['Password'],{encoding:'utf8'}).trim();if(token!=='fixture-private-token')process.exit(9);process.stderr.write(token.slice(0,8));process.stderr.write(token.slice(8)+'\\n');const mapped=args.map(x=>x==='https://fixture.invalid/team/project.git'?'file://'+process.env.QL_DIR+'/origin':x);const r=cp.spawnSync(${JSON.stringify(
      realGit,
    )},mapped,{env:{...process.env,GIT_ALLOW_PROTOCOL:'file'},stdio:'inherit'});process.exit(r.status??1);\n`,
    { mode: 0o700 },
  );
  const credential = {
    name: 'fixture',
    provider: 'generic',
    auth_type: 'https_token',
    status: 'enabled',
    capability: 'READ',
  };
  const resolver = new Resolver();
  const remote = 'https://fixture.invalid/team/project.git';
  const run = async (branch) => {
    const c = await resolver.resolve(
      credential,
      { token: 'fixture-private-token' },
      remote,
    );
    Object.assign(c.env, {
      QL_DIR: dir,
      QL_DATA_DIR: path.join(dir, 'data'),
      PATH: path.join(dir, 'bin') + ':' + process.env.PATH,
      SUB_ID: '42',
    });
    try {
      const result = await runGitProcess(
        '/bin/bash',
        [
          path.join(dir, 'shell/update.sh'),
          'repo',
          remote,
          '',
          '',
          '',
          branch,
          'js|py|sh',
          '',
          'true',
          'true',
        ],
        c,
        20000,
      );
      assert.equal(result.code, 0, result.output);
      assert.equal(result.output.includes('fixture-private-token'), false);
      return result;
    } finally {
      await c.cleanup();
    }
  };
  const probe = await resolver.resolve(
    credential,
    { token: 'fixture-private-token' },
    remote,
  );
  Object.assign(probe.env, {
    QL_DIR: dir,
    PATH: path.join(dir, 'bin') + ':' + process.env.PATH,
  });
  try {
    const result = await runGitProcess(
      'git',
      ['ls-remote', '--', remote],
      probe,
    );
    assert.equal(result.code, 0);
    assert.match(result.output, /refs\/heads\/dev/);
    assert.equal(result.output.includes('fixture-private-token'), false);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'data/repo')), []);
  } finally {
    await probe.cleanup();
  }
  await run('main');
  const working = path.join(dir, 'data/repo/team_project_main');
  assert.equal(
    execFileSync(realGit, ['rev-parse', '--is-shallow-repository'], {
      cwd: working,
      encoding: 'utf8',
    }).trim(),
    'true',
  );
  fs.writeFileSync(path.join(working, 'local-only'), 'discard');
  await run('main');
  assert.equal(fs.existsSync(path.join(working, 'local-only')), false);
  await run('dev');
  assert.equal(
    fs.existsSync(path.join(dir, 'data/repo/team_project_dev/dev.txt')),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(dir, 'data/scripts/team_project_main/python/example.py'),
    ),
    true,
  );
  assert.match(
    fs.readFileSync(path.join(dir, 'created'), 'utf8'),
    /phase0-python:42/,
  );
  const argv = fs.readFileSync(path.join(dir, 'git-argv'), 'utf8');
  assert.equal(argv.includes('fixture-private-token'), false);
  assert.match(argv, /--depth=1/);
  assert.equal(
    fs
      .readFileSync(path.join(working, '.git/config'), 'utf8')
      .includes('fixture-private-token'),
    false,
  );
});
