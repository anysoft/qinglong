const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const setup = require('./helpers.cjs');
const { Container } = require('typedi');
async function pipeline(t) {
  const h = await setup(t);
  const Managed = h.get('services/managedSubscription').default,
    Resolver = h.get('services/subscriptionGit').default,
    Cron = h.get('services/cron').default;
  const cron = new Cron({ error() {}, warn() {} });
  Container.set(Cron, cron);
  t.after(() => Container.remove(Cron));
  const managed = new Managed(h.storage, h.worktrees, new Resolver());
  await fs.writeFile(
    path.join(h.origin, 'job.js'),
    '// cron: 0 8 * * *\n// new Env("job")\nconsole.log("first");\n',
  );
  h.git('add', '.');
  h.git('commit', '-qm', 'script');
  const sub = await h.SubscriptionModel.create({
    type: 'public-repo',
    name: 'Managed',
    url: '',
    alias: 'display-only',
    repository_id: h.repo.id,
    branch: 'main',
    schedule_type: 'crontab',
    git_mode: 'LEGACY',
    autoAddCron: true,
    autoDelCron: true,
  });
  return {
    ...h,
    managed,
    cron,
    sub,
    script: path.join(h.dir, 'scripts/team_project_main/job.js'),
  };
}
test('explicit mode switch, first sync, retry without duplicate Tasks, FF update and rollback to Legacy', async (t) => {
  const h = await pipeline(t);
  assert.equal(h.sub.git_mode, 'LEGACY');
  await h.managed.mode(h.sub.id, 'MANAGED');
  await h.managed.run(h.sub.id);
  assert.match(await fs.readFile(h.script, 'utf8'), /first/);
  const original = (await h.CrontabModel.findAll()).map((x) =>
    x.get({ plain: true }),
  );
  assert.equal(original.length, 1);
  assert.equal(original[0].command, 'task team_project_main/job.js');
  await h.managed.run(h.sub.id);
  assert.equal(await h.CrontabModel.count(), 1);
  await fs.writeFile(
    path.join(h.origin, 'job.js'),
    '// cron: 0 9 * * *\nconsole.log("second");\n',
  );
  h.git('add', '.');
  h.git('commit', '-qm', 'second');
  await h.managed.run(h.sub.id);
  assert.match(await fs.readFile(h.script, 'utf8'), /second/);
  assert.equal(
    (await h.CrontabModel.findByPk(original[0].id)).schedule,
    '0 8 * * *',
  );
  const id = (await h.sub.reload()).worktree_id;
  await h.managed.mode(h.sub.id, 'LEGACY');
  assert.ok(await h.WorktreeModel.findByPk(id));
  assert.equal((await h.sub.reload()).worktree_id, id);
});
for (const state of ['dirty', 'untracked', 'ahead', 'missing', 'detached'])
  test(`${state} Worktree preserves last scripts and Tasks`, async (t) => {
    const h = await pipeline(t);
    await h.managed.mode(h.sub.id, 'MANAGED');
    await h.managed.run(h.sub.id);
    const wt = await h.WorktreeModel.findByPk(
      (
        await h.sub.reload()
      ).worktree_id,
    );
    const prior = await fs.readFile(h.script, 'utf8'),
      tasks = JSON.stringify(
        (await h.CrontabModel.findAll()).map((x) => x.get({ plain: true })),
      );
    if (state === 'missing') await fs.rm(wt.local_path, { recursive: true });
    else if (state === 'detached')
      h.local(wt.local_path, 'checkout', '--detach');
    else {
      await fs.writeFile(
        path.join(wt.local_path, state === 'untracked' ? 'extra' : 'job.js'),
        'local',
      );
      if (state === 'ahead') {
        h.local(wt.local_path, 'add', '.');
        h.local(wt.local_path, 'commit', '-qm', 'local');
      }
    }
    await assert.rejects(h.managed.run(h.sub.id));
    assert.equal(await fs.readFile(h.script, 'utf8'), prior);
    assert.equal(
      JSON.stringify(
        (await h.CrontabModel.findAll()).map((x) => x.get({ plain: true })),
      ),
      tasks,
    );
    assert.equal((await h.sub.reload()).last_sync_state, 'FAILED');
  });
test('discovery failure preserves last good state and retry at same commit succeeds', async (t) => {
  const h = await pipeline(t);
  await h.managed.mode(h.sub.id, 'MANAGED');
  await h.managed.run(h.sub.id);
  const prior = await fs.readFile(h.script, 'utf8');
  await h.sub.update({ whitelist: '[' });
  await assert.rejects(h.managed.run(h.sub.id));
  assert.equal(await fs.readFile(h.script, 'utf8'), prior);
  await h.sub.update({ whitelist: '' });
  await h.managed.run(h.sub.id);
  assert.equal(await h.CrontabModel.count(), 1);
});
test('shared repository/branch binding is retained and blocks worktree deletion', async (t) => {
  const h = await pipeline(t);
  await h.managed.mode(h.sub.id, 'MANAGED');
  const id = (await h.sub.reload()).worktree_id;
  const second = await h.SubscriptionModel.create({
    ...h.sub.get({ plain: true }),
    id: undefined,
    name: 'second',
    alias: 'second',
    worktree_id: null,
  });
  await h.managed.mode(second.id, 'MANAGED');
  assert.equal((await second.reload()).worktree_id, id);
  await assert.rejects(h.worktrees.remove(id), {
    error_code: 'WORKTREE_IN_USE',
  });
  await h.sub.destroy();
  await assert.rejects(h.worktrees.remove(id), {
    error_code: 'WORKTREE_IN_USE',
  });
});
test('fetch, scanner, copy and Cron failures preserve Tasks; every failure can retry', async (t) => {
  const h = await pipeline(t);
  await h.managed.mode(h.sub.id, 'MANAGED');
  await h.managed.run(h.sub.id);
  const saved = await h.CrontabModel.findOne(),
    prior = await fs.readFile(h.script, 'utf8');
  await t.test('network failure never reaches discovery', async () => {
    const fetch = h.storage.fetch;
    h.storage.fetch = async () => {
      throw Object.assign(new Error('network'), {
        error_code: 'GIT_COMMAND_FAILED',
      });
    };
    await assert.rejects(h.managed.run(h.sub.id));
    h.storage.fetch = fetch;
    assert.equal(await fs.readFile(h.script, 'utf8'), prior);
    assert.equal(await h.CrontabModel.count(), 1);
  });
  await fs.rm(path.join(h.origin, 'job.js'));
  await fs.writeFile(
    path.join(h.origin, 'new.js'),
    '// cron: 1 9 * * *\nconsole.log("new");\n',
  );
  h.git('add', '-A');
  h.git('commit', '-qm', 'replace');
  await t.test(
    'partial Cron registration failure restores original ID and scripts',
    async () => {
      const client = h.mocks['../schedule/client'],
        add = client.addCron;
      let once = true;
      client.addCron = async () => {
        if (once) {
          once = false;
          throw new Error('scheduler unavailable');
        }
      };
      await assert.rejects(h.managed.run(h.sub.id));
      client.addCron = add;
      assert.equal(await fs.readFile(h.script, 'utf8'), prior);
      const tasks = await h.CrontabModel.findAll();
      assert.equal(tasks.length, 1);
      assert.equal(tasks[0].id, saved.id);
      assert.equal(tasks[0].command, saved.command);
    },
  );
  await t.test(
    'retry at already updated commit applies old scanner add/drop',
    async () => {
      await h.managed.run(h.sub.id);
      await assert.rejects(fs.stat(h.script), { code: 'ENOENT' });
      const rows = await h.CrontabModel.findAll();
      assert.equal(rows.length, 1);
      assert.equal(rows[0].command, 'task team_project_main/new.js');
    },
  );
  await t.test('copy failure leaves current scripts intact', async () => {
    await fs.rm(path.join(h.dir, 'scripts/sendNotify.js'));
    const before = await fs.readFile(
      path.join(h.dir, 'scripts/team_project_main/new.js'),
      'utf8',
    );
    await assert.rejects(h.managed.run(h.sub.id));
    assert.equal(
      await fs.readFile(
        path.join(h.dir, 'scripts/team_project_main/new.js'),
        'utf8',
      ),
      before,
    );
    await fs.writeFile(path.join(h.dir, 'scripts/sendNotify.js'), '');
    await h.managed.run(h.sub.id);
  });
});
test('Managed leases block overlapping sync, update and binding changes', async (t) => {
  const h = await pipeline(t);
  await h.managed.mode(h.sub.id, 'MANAGED');
  const id = (await h.sub.reload()).worktree_id;
  await h.managed.exclusive(h.sub.id, async () => {
    await assert.rejects(h.managed.run(h.sub.id));
    await assert.rejects(h.managed.mode(h.sub.id, 'LEGACY'));
  });
  await h.worktrees.withSync(id, async () => {
    await assert.rejects(h.worktrees.update(id));
    await assert.rejects(h.storage.fetch(h.repo.id));
  });
  await h.managed.run(h.sub.id);
});
test('symlink source is refused without reading or copying outside data root', async (t) => {
  const h = await pipeline(t);
  await h.managed.mode(h.sub.id, 'MANAGED');
  await h.managed.run(h.sub.id);
  const previous = await fs.readFile(h.script, 'utf8');
  await fs.symlink('/etc/passwd', path.join(h.origin, 'outside.js'));
  h.git('add', '.');
  h.git('commit', '-qm', 'symlink');
  await assert.rejects(h.managed.run(h.sub.id));
  assert.equal(await fs.readFile(h.script, 'utf8'), previous);
  await assert.rejects(
    fs.stat(path.join(h.dir, 'scripts/team_project_main/outside.js')),
    { code: 'ENOENT' },
  );
});
test('branch selection creates a new binding and preserves the old Worktree', async (t) => {
  const h = await pipeline(t);
  await h.managed.mode(h.sub.id, 'MANAGED');
  await h.managed.run(h.sub.id);
  const old = (await h.sub.reload()).worktree_id;
  h.git('branch', 'feature/new');
  await h.managed.withBinding(
    { ...h.sub.get({ plain: true }), branch: 'feature/new' },
    (id) => h.sub.update({ branch: 'feature/new', worktree_id: id }),
  );
  await h.managed.run(h.sub.id);
  assert.notEqual(h.sub.worktree_id, old);
  assert.ok(await h.WorktreeModel.findByPk(old));
  assert.match(
    await fs.readFile(
      path.join(h.dir, 'scripts/team_project_feature/new/job.js'),
      'utf8',
    ),
    /first/,
  );
});
for (const failure of [
  'branch deleted',
  'force push',
  'storage missing',
  'disabled credential',
])
  test(`${failure} stops before scripts and Task diff`, async (t) => {
    const h = await pipeline(t);
    await h.managed.mode(h.sub.id, 'MANAGED');
    await h.managed.run(h.sub.id);
    const prior = await fs.readFile(h.script, 'utf8');
    if (failure === 'branch deleted') {
      h.git('checkout', 'dev');
      h.git('branch', '-D', 'main');
    }
    if (failure === 'force push') {
      h.git('reset', '--hard', 'HEAD~1');
      await fs.writeFile(path.join(h.origin, 'diverged.txt'), 'diverged');
      h.git('add', '.');
      h.git('commit', '-qm', 'rewritten history');
    }
    if (failure === 'storage missing') {
      const repo = await h.storage.get(h.repo.id);
      await fs.rename(repo.storage_path, repo.storage_path + '.preserved');
    }
    if (failure === 'disabled credential') {
      const credential = await h.credentials.save({
        name: 'disabled',
        provider: 'generic',
        auth_type: 'https_token',
        token: 'test-do-not-leak',
      });
      await h.GitCredentialModel.update(
        { status: 'disabled' },
        { where: { id: credential.id } },
      );
      await h.sub.update({ credential_id: credential.id });
    }
    await assert.rejects(h.managed.run(h.sub.id));
    assert.equal(await fs.readFile(h.script, 'utf8'), prior);
    assert.equal(await h.CrontabModel.count(), 1);
  });
