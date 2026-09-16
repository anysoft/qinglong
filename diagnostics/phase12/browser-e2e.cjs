const acceptance=require('../../scripts/ci/acceptance.cjs');
const evidenceDirectory=acceptance.output(__dirname);
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  net = require('node:net'),
  assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const runtime =
  process.env.QL_BROWSER_RUNTIME ||
  '/tmp/qinglong-phase45b-browser/node_modules';
const { chromium } = require(path.join(runtime, 'playwright')),
  { Server, utils } = require(path.join(runtime, 'ssh2'));
const root = path.resolve(__dirname, '../..'),
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-full-'));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const evidence = {
  status: 'RUNNING',
  steps: [],
  linux: process.platform === 'linux',
};
let rejectSsh = false;
let flushBrowser=()=>{};
let backend,
  browser,
  ssh,
  packageIndex,
  nodeRegistry,
  receiver,
  output = '',
  page;
const messages = [];
let receiverFailure = false;
const connections = new Set();
const mark = (name) => {
  evidence.steps.push(name);
  console.log(name);
};
async function port() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
async function stop() {
  if (!backend) return;
  const cp = backend;
  backend = null;
  try {
    process.kill(-cp.pid, 'SIGTERM');
  } catch {}
  for (let i = 0; i < 40 && cp.exitCode === null; i++) await delay(100);
  try {
    process.kill(-cp.pid, 'SIGKILL');
  } catch {}
}
async function until(fn) {
  const deadline = Date.now() + 60000;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (e) {
      last = e;
    }
    await delay(200);
  }
  throw last || new Error('poll timeout');
}
(async () => {
  fs.chmodSync(tmp, 0o700);
  for (const d of ['shell', 'sample'])
    fs.cpSync(path.join(root, d), path.join(tmp, d), { recursive: true });
  fs.copyFileSync(
    path.join(root, 'version.yaml'),
    path.join(tmp, 'version.yaml'),
  );
  fs.symlinkSync(
    path.join(root, 'node_modules'),
    path.join(tmp, 'node_modules'),
  );
  fs.mkdirSync(path.join(tmp, 'back'));
  fs.symlinkSync(path.join(root, 'back/protos'), path.join(tmp, 'back/protos'));
  fs.mkdirSync(path.join(tmp, 'static'));
  for (const d of ['build', 'dist'])
    fs.symlinkSync(path.join(root, 'static', d), path.join(tmp, 'static', d));
  fs.mkdirSync(path.join(tmp, 'home'));
  fs.mkdirSync(path.join(tmp, 'bin'));
  fs.symlinkSync(path.join(tmp, 'shell/task.sh'), path.join(tmp, 'bin/task'));
  fs.symlinkSync(path.join(tmp, 'shell/update.sh'), path.join(tmp, 'bin/ql'));
  fs.writeFileSync(
    path.join(tmp, '.env'),
    'JWT_SECRET=' + acceptance.secret('local-e2e-only-backend-secret') + '\n',
  );
  const origin = path.join(tmp, 'origin');
  fs.mkdirSync(origin);
  const git = (...args) =>
    execFileSync('git', args, { cwd: origin, stdio: 'pipe' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  const scripts = {
    js: 'const fs=require("fs"); console.log("E2E_NODE:"+process.env.GLOBAL_VALUE+":"+process.env.PROFILE_VALUE+":"+process.env.TASK_VALUE); console.log("CONFIG_OK:"+fs.readFileSync("config.txt","utf8")); if(fs.existsSync("secret.txt"))console.log(fs.readFileSync("secret.txt","utf8")); console.log(process.env.HOOK_TOKEN);',
    py: 'import os\nprint("E2E_PYTHON:"+os.environ["GLOBAL_VALUE"]+":"+os.environ["PROFILE_VALUE"]+":"+os.environ["TASK_VALUE"])\nprint("CONFIG_OK:"+open("config.txt").read())\nif os.path.exists("secret.txt"): print(open("secret.txt").read())\nprint(os.environ["HOOK_TOKEN"])',
    sh: 'printf "E2E_SHELL:%s:%s:%s\\n" "$GLOBAL_VALUE" "$PROFILE_VALUE" "$TASK_VALUE"; printf "CONFIG_OK:"; cat config.txt; [ ! -f secret.txt ] || cat secret.txt; printf "\\n%s\\n" "$HOOK_TOKEN"',
  };

  scripts.js +=
    '\nconsole.log("MANAGED_NODE:"+process.execPath+":"+require("ql-phase8-foo"));';
  scripts.py +=
    '\nimport sys, ql_phase7_root\nprint("MANAGED_PYTHON:"+sys.executable+":"+ql_phase7_root.__version__)';
  scripts.sh +=
    '\ncase "${1:-}" in --fail) exit 7;; --timeout) sleep 30;; --retry) if [ ! -f .retry-marker ]; then touch .retry-marker; exit 7; fi;; --observe) echo OBSERVABILITY_FIRST; sleep 25; echo OBSERVABILITY_LAST;; esac';
  scripts.sh += '\nif [ "${1:-}" = "--sleep" ]; then sleep 30; fi';
  for (const [ext, body] of Object.entries(scripts))
    fs.writeFileSync(
      path.join(origin, `job.${ext}`),
      `${ext === 'js' ? '//' : '#'} name: E2E ${ext}\n${
        ext === 'js' ? '//' : '#'
      } cron: 0 0 1 1 *\n${body}\n`,
    );
  git('add', '.');
  git('commit', '-qm', 'fixture');
  git('branch', 'secondary');
  git('config', 'receive.denyCurrentBranch', 'updateInstead');
  fs.writeFileSync(path.join(origin, 'edit.txt'), 'original\n');
  fs.writeFileSync(
    path.join(origin, 'slow.sh'),
    'echo START\nsleep 8\necho DONE\n',
  );
  git('add', '.');
  git('commit', '-qm', 'workspace fixtures');
  for (const name of ['host', 'client'])
    execFileSync(
      'ssh-keygen',
      ['-q', '-t', 'ed25519', '-N', '', '-f', path.join(tmp, name)],
      { stdio: 'pipe' },
    );
  const clientKey = utils.parseKey(
      fs.readFileSync(path.join(tmp, 'client.pub')),
    ),
    hostPublic = fs
      .readFileSync(path.join(tmp, 'host.pub'), 'utf8')
      .trim()
      .split(' ')
      .slice(0, 2)
      .join(' ');
  ssh = new Server(
    { hostKeys: [fs.readFileSync(path.join(tmp, 'host'))] },
    (client) => {
      connections.add(client);
      client
        .on('error', () => {})
        .on('close', () => connections.delete(client));
      client.on('authentication', (ctx) => {
        if (
          rejectSsh ||
          ctx.username !== 'git' ||
          ctx.method !== 'publickey' ||
          !ctx.key.data.equals(clientKey.getPublicSSH()) ||
          (ctx.signature &&
            clientKey.verify(ctx.blob, ctx.signature, ctx.hashAlgo) !== true)
        )
          return ctx.reject();
        ctx.accept();
      });
      client.on('ready', () =>
        client.on('session', (accept) =>
          accept().on('exec', (accept, reject, info) => {
            if (
              ![
                "git-upload-pack '/fixture.git'",
                "git-receive-pack '/fixture.git'",
              ].includes(info.command)
            )
              return reject();
            const stream = accept();
            const cp = spawn(
              info.command.startsWith('git-receive-pack')
                ? 'git-receive-pack'
                : 'git-upload-pack',
              [origin],
              { stdio: ['pipe', 'pipe', 'pipe'] },
            );
            stream.pipe(cp.stdin);
            cp.stdout.pipe(stream, { end: false });
            cp.stderr.pipe(stream.stderr, { end: false });
            cp.on('close', (code) => {
              stream.exit(code || 0);
              stream.end();
            });
            stream.on('close', () => cp.kill());
          }),
        ),
      );
    },
  );
  await new Promise((r) => ssh.listen(0, '127.0.0.1', r));
  const sshPort = ssh.address().port,
    http = await port(),
    grpc = await port(),
    base = `http://127.0.0.1:${http}`;
  const env = {
    ...process.env,
    QL_DIR: tmp,
    QL_DATA_DIR: path.join(tmp, 'data'),
    HOME: path.join(tmp, 'home'),
    PATH: path.join(tmp, 'bin') + ':' + process.env.PATH,
    JWT_SECRET: acceptance.secret('local-e2e-only-backend-secret'),
    BACK_PORT: String(http),
    GRPC_PORT: String(grpc),
    BIND_HOST: '127.0.0.1',
    BIND_HOST_GRPC: '127.0.0.1',
    QL_SCHEDULER: 'node',
    NODE_ENV: 'production',
  };
  async function start() {
    backend = spawn(
      process.execPath,
      [path.join(root, 'static/build/app.js')],
      { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    acceptance.track(backend);backend.stdout.on('data', (b) => (output += b));
    backend.stderr.on('data', (b) => (output += b));
    await until(async () => {
      const r = await fetch(base + '/api/system');
      return (await r.json()).code === 200;
    });
  }
  await start();
  mark('empty-root-bootstrap');
  browser = await chromium.launch({
    headless: true,
    ...(process.env.QL_BROWSER_EXECUTABLE ? {executablePath:process.env.QL_BROWSER_EXECUTABLE} : {}),
    ...(process.platform === 'darwin' ? { channel: 'chrome' } : {}),
  });
  page = await browser.newPage({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1100 },
  });
  flushBrowser=acceptance.observe(page,evidenceDirectory);page.setDefaultTimeout(20000);
  const forbidden = [
    'local-e2e-only-backend-secret',
    'CONFIG_SECRET_E2E',
    'generated-private-e2e',
    'ENV_SECRET_E2E',
    'NOTIFICATION_SECRET_E2E',
  ];
  acceptance.register(fs.readFileSync(path.join(tmp,'client'),'utf8').split('\n')[1]);forbidden.push(...acceptance.values());const leaks = [];
  const inspected = [];
  let websocketFrames = 0,
    runLogFrames = 0;
  page.on('websocket', (socket) =>
    socket.on('framereceived', (event) => {
      websocketFrames++;
      if (String(event.payload).includes('runLog')) runLogFrames++;
      if (forbidden.some((value) => String(event.payload).includes(value)))
        leaks.push('websocket:' + new URL(socket.url()).pathname);
    }),
  );
  page.on('response', async (response) => {
    if (!response.url().includes('/api/')) return;
    try {
      const body = await response.text();
      inspected.push(response.url());
      if (forbidden.some((value) => body.includes(value)))
        leaks.push(new URL(response.url()).pathname);
    } catch {}
  });
  await page.goto(base);
  await page.getByRole('button', { name: '开始安装', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill('platform-owner');
  await page.getByLabel('密码', { exact: true }).fill(acceptance.secret('e2e-fixture-password'));
  await page
    .getByLabel('确认密码', { exact: true })
    .fill(acceptance.secret('e2e-fixture-password'));
  await page.getByRole('button', { name: /提.*交/ }).click();
  await page.getByRole('button', { name: '去登录', exact: true }).click();
  async function login() {
    await page.getByLabel('用户名', { exact: true }).fill('platform-owner');
    await page.getByLabel('密码', { exact: true }).fill(acceptance.secret('e2e-fixture-password'));
    await page.getByRole('button', { name: /登.*录/ }).click();
    await until(async () =>
      page.evaluate(() => !!localStorage.getItem('token')),
    );
    acceptance.register(await page.evaluate(() => localStorage.getItem('token')));
  }
  await login();
  mark('browser-fresh-initialize-login');
  const api = async (url, method = 'GET', body) =>
    page.evaluate(
      async ({ url, method, body }) => {
        const token = localStorage.getItem('token');
        const r = await fetch('/api' + url, {
          method,
          headers: {
            'content-type': 'application/json',
            Authorization: 'Bearer ' + token,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return r.json();
      },
      { url, method, body: acceptance.payload(body) },
    );
  const checked = async (url, method = 'GET', body) => {
    let r;
    for (let attempt = 0; attempt < 6; attempt++) {
      r = await api(url, method, body);
      if (!['REPOSITORY_BUSY', 'WORKTREE_BUSY'].includes(r.error_code)) break;
      await delay(250);
    }
    assert.ok([200, 202].includes(r.code), url + ': ' + JSON.stringify(r));
    return r.data;
  };
  const credential = await checked('/git-credentials', 'POST', {
    name: 'Workspace SSH',
    provider: 'generic',
    auth_type: 'ssh_key',
    capability: 'WRITE',
    private_key: fs.readFileSync(path.join(tmp, 'client'), 'utf8'),
    known_hosts: `[127.0.0.1]:${sshPort} ${hostPublic}`,
  });
  const repo = await checked('/repositories', 'POST', {
    name: 'Workspace Repository',
    remote_url: `ssh://git@127.0.0.1:${sshPort}/fixture.git`,
    default_credential_id: credential.id,
  });
  await checked(`/repositories/${repo.id}/initialize`, 'POST', {});
  const wt = await checked('/worktrees', 'POST', {
    repository_id: repo.id,
    name: 'Workspace main',
    ref_type: 'branch',
    ref_name: 'main',
  });
  const wtPath = path.join(
      env.QL_DATA_DIR,
      'worktrees',
      `repository-${repo.id}`,
      `wt-${wt.id}`,
    ),
    ws = `/workspaces/${wt.id}`;
  const task = await checked('/tasks', 'POST', {
    name: 'Workspace Long Task',
    enabled: true,
    arguments: [],
    source: {
      type: 'WORKTREE_ENTRYPOINT',
      worktree_id: wt.id,
      relative_entrypoint: 'slow.sh',
      language: 'SHELL',
      cwd_mode: 'WORKTREE_ROOT',
      cwd_relative_path: null,
    },
    runtime: { kind: 'SHELL' },
    settings: { concurrency: 'QUEUE', max_attempts: 1 },
  });
  forbidden.push(
    fs.readFileSync(path.join(tmp, 'client'), 'utf8').split('\n')[1],
  );
  page.on('console', (message) => {
    if (forbidden.some((value) => message.text().includes(value)))
      leaks.push('console');
  });
  await checked('/scoped-env/global/variables', 'PUT', [
    {
      name: 'WORKSPACE_SECRET',
      value: 'ENV_SECRET_E2E',
      is_secret: true,
      replace_secret: true,
      operation: 'SET',
      status: 'enabled',
    },
  ]);
  await checked('/notification-channels', 'POST', {
    name: 'Workspace private channel',
    type: 'WEBHOOK',
    enabled: false,
    secret_action: 'REPLACE',
    secret: {
      url: 'http://127.0.0.1:9/notify',
      authorization: 'NOTIFICATION_SECRET_E2E',
    },
  });
  const asset = await checked('/config-assets', 'POST', {
    name: 'Workspace private config',
    content_type: 'TEXT',
    is_secret: true,
    content: 'CONFIG_SECRET_E2E',
  });
  await checked(`/tasks/${task.id}/config-bindings`, 'POST', {
    asset_id: asset.id,
    operation: 'ATTACH',
    target_base: 'WORKSPACE_ROOT',
    target_path: 'secret.txt',
    materialization_mode: 'COPY',
    conflict_policy: 'FAIL_IF_EXISTS',
    writable: false,
    enabled: true,
  });
  const sub = await checked('/subscriptions', 'POST', {
    name: 'Workspace sync',
    repository_id: repo.id,
    branch: 'main',
    schedule_type: 'crontab',
    schedule: '',
  });
  await checked(`/subscriptions/${sub.id}/prepare`, 'POST', {});
  await checked('/subscriptions/run', 'PUT', [sub.id]);
  await until(
    async () =>
      (await checked('/subscriptions')).find((s) => s.id === sub.id)
        ?.last_sync_state === 'SUCCESS',
  );
  const gitTrigger = await checked(`/tasks/${task.id}/triggers`, 'POST', {
    type: 'GIT_UPDATE',
    enabled: true,
    config: { mode: 'ANY_CHANGE', path_filters: [], fire_on_initial: false },
  });
  const initialEvents = (await checked(`/tasks/${task.id}/trigger-events`))
    .length;
  const initialRuns = (await checked(`/tasks/${task.id}/runs`)).length;
  await page.goto(base + '/repository-workspace?id='+repo.id);
  await page.getByRole('tab',{name:'Worktrees',exact:true}).click();
  await page.getByRole('link',{name:'Open Workspace',exact:true}).click();
  await page.waitForURL('**/workspace?id='+wt.id);
  mark('browser-repository-worktree-open-workspace');
  await page.getByRole('button', { name: 'edit.txt', exact: true }).click();
  const editor = page.locator('.workspace-editor .monaco-editor textarea');
  // Initial Git status and file reads share repository ownership; retry only
  // the explicit transient busy response without relaxing editor assertions.
  await until(async () => {
    if (await editor.count()) return true;
    if (await page.getByText('REPOSITORY_BUSY', {exact:true}).count())
      await page.getByRole('button', { name: 'edit.txt', exact: true }).click();
    return false;
  });
  await editor.waitFor();
  async function replace(text) {
    await editor.click();
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+A' : 'Control+A',
    );
    await page.keyboard.insertText(text);
  }
  await replace('browser saved\n');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    () =>
      fs.readFileSync(path.join(wtPath, 'edit.txt'), 'utf8') ===
      'browser saved\n',
  );
  mark('browser-open-edit-atomic-save');
  const changes = page.locator('.workspace-git');
  await changes.getByRole('button', { name: 'Diff', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByText(/browser saved/)
    .waitFor();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  mark('browser-working-diff');
  await page.getByRole('button', { name: 'New file', exact: true }).click();
  await page.getByLabel('New path').fill('browser-new.py');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /确.*定|OK/ })
    .click();
  await page
    .getByRole('tab', { name: 'browser-new.py', exact: true })
    .waitFor();
  await replace('print("workspace")\n');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await until(() =>
    fs
      .readFileSync(path.join(wtPath, 'browser-new.py'), 'utf8')
      .includes('workspace'),
  );
  await until(async () => (await checked(ws + '/git/status')).untracked === 1);
  mark('browser-create-untracked-file');
  await changes.getByLabel('Git author name').fill('Browser Author');
  await changes.getByLabel('Git author email').fill('browser@example.invalid');
  const identityResponse = page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith(ws + '/git/identity'),
  );
  await changes
    .getByRole('button', { name: 'Save Git identity', exact: true })
    .click();
  assert.equal((await (await identityResponse).json()).code, 200);
  for (const name of ['browser-new.py', 'edit.txt']) {
    const row = changes.locator('.ant-list-item').filter({ hasText: name });
    let staged;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = page.waitForResponse((r) =>
        new URL(r.url()).pathname.endsWith(ws + '/git/stage'),
      );
      await row.getByRole('button', { name: 'Stage', exact: true }).click();
      staged = await (await response).json();
      if (staged.code === 200) break;
      assert.equal(staged.error_code, 'REPOSITORY_BUSY');
      await delay(400);
    }
    assert.equal(staged.code, 200);
    await page.getByRole('button', { name: 'Refresh', exact: true }).waitFor();
    await until(
      async () =>
        !(await page
          .getByRole('button', { name: 'Refresh', exact: true })
          .isDisabled()),
    );
  }
  const before = (await checked(ws)).head;
  await changes
    .getByLabel('Commit message')
    .fill('Browser workspace commit\n\nUnicode 提交');
  const committedResponse = page.waitForResponse((r) =>
    new URL(r.url()).pathname.endsWith(ws + '/git/commit'),
  );
  await changes.getByRole('button', { name: /Commit staged/ }).click();
  const committedBody = await (await committedResponse).json();
  assert.equal(committedBody.code, 200, JSON.stringify(committedBody));
  const pushed = committedBody.data.sha;
  assert.notEqual(pushed, before);
  await until(
    async () =>
      !(await page
        .getByRole('button', { name: 'Refresh', exact: true })
        .isDisabled()),
  );
  assert.notEqual(git('rev-parse', 'HEAD').toString().trim(), pushed);
  mark('browser-stage-explicit-commit-no-auto-push');
  await changes.getByRole('button', { name: 'Push', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /确.*定|OK/ })
    .click();
  await until(() => git('rev-parse', 'HEAD').toString().trim() === pushed);
  mark('browser-explicit-real-ssh-push');
  assert.equal((await checked(`/tasks/${task.id}/runs`)).length, initialRuns);
  mark('editor-commit-push-no-task-submission');
  assert.equal(
    (await checked(`/tasks/${task.id}/trigger-events`)).length,
    initialEvents,
  );
  rejectSsh = true;
  try {
    assert.equal(
      (
        await until(async () => {
          const r = await api(ws + '/git/push', 'POST', {});
          return ['REPOSITORY_BUSY', 'WORKTREE_BUSY'].includes(r.error_code)
            ? false
            : r;
        })
      ).error_code,
      'GIT_AUTH_FAILED',
    );
  } finally {
    rejectSsh = false;
  }
  await new Promise((r) => ssh.close(r));
  try {
    assert.equal(
      (
        await until(async () => {
          const r = await api(ws + '/git/push', 'POST', {});
          return ['REPOSITORY_BUSY', 'WORKTREE_BUSY'].includes(r.error_code)
            ? false
            : r;
        })
      ).error_code,
      'GIT_REMOTE_UNREACHABLE',
    );
  } finally {
    await new Promise((r) => ssh.listen(sshPort, '127.0.0.1', r));
  }
  mark('real-ssh-push-authentication-and-network-failures');
  fs.writeFileSync(path.join(origin, 'remote-change'), 'managed update');
  git('add', '.');
  git('commit', '-qm', 'remote update');
  const remoteSha = git('rev-parse', 'HEAD').toString().trim();
  await page.getByRole('button', { name: 'Sync', exact: true }).click();
  await until(
    async () =>
      (await checked('/subscriptions')).find((s) => s.id === sub.id)
        ?.last_synced_commit === remoteSha,
  );
  await until(async () => {
    const event = (await checked(`/tasks/${task.id}/trigger-events`)).find(
      (e) =>
        e.trigger_id === gitTrigger.id &&
        e.metadata.after === remoteSha &&
        e.task_run_id,
    );
    return (
      event &&
      (await checked(`/task-runs/${event.task_run_id}`)).status === 'SUCCESS'
    );
  });
  mark('official-sync-new-remote-commit-produces-git-event-and-run');

  await page.getByRole('tab', { name: 'edit.txt', exact: true }).click();
  await replace('my draft\n');
  await page
    .locator('.ant-tabs-tab')
    .filter({has:page.getByRole('tab', {name:'edit.txt •',exact:true})})
    .locator('.ant-tabs-tab-remove')
    .click();
  await page.getByText('放弃此文件未保存的更改？', { exact: true }).waitFor();
  await page.getByRole('button', { name: /取.*消|Cancel/ }).click();
  assert.ok(
    await page.getByRole('tab', { name: 'edit.txt •', exact: true }).count(),
  );
  await page.locator('a[href="/tasks"]').first().click();
  await page.getByText('放弃未保存的更改？', { exact: true }).waitFor();
  await page.getByRole('button', { name: /取.*消|Cancel/ }).click();
  assert.ok(page.url().includes('/workspace'));
  mark('browser-dirty-tab-close-and-navigation-confirmation');
  execFileSync(process.execPath, [
    '-e',
    'require("fs").writeFileSync(process.argv[1],"external process\\n")',
    path.join(wtPath, 'edit.txt'),
  ]);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('File changed on disk', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(
    fs.readFileSync(path.join(wtPath, 'edit.txt'), 'utf8'),
    'external process\n',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Reload', exact: true }).click();
  await page
    .locator('.workspace-editor .view-lines')
    .getByText('external process', { exact: false })
    .waitFor();
  mark('browser-external-process-conflict-cancel-reload');
  await replace('after execution\n');
  const run = await checked(`/tasks/${task.id}/run`, 'POST', {
    source: 'MANUAL',
  });
  await until(
    async () => (await checked(`/task-runs/${run.id}`)).status === 'RUNNING',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText(/WORKTREE_BUSY：/).waitFor();
  assert.equal(
    (await api(ws + '/files?path=edit.txt')).error_code,
    'WORKTREE_BUSY',
  );
  assert.equal(
    (await api(ws + '/files?path=secret.txt')).error_code,
    'WORKTREE_BUSY',
  );
  await until(
    async () => (await checked(`/task-runs/${run.id}`)).status === 'SUCCESS',
  );
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await until(
    () =>
      fs.readFileSync(path.join(wtPath, 'edit.txt'), 'utf8') ===
      'after execution\n',
  );
  mark('browser-real-long-task-busy-then-save');
  await until(
    async () =>
      !(await page
        .getByRole('button', { name: 'Refresh', exact: true })
        .isDisabled()),
  );
  assert.ok(!fs.existsSync(path.join(wtPath, 'secret.txt')));
  const documentSnapshot = await page.evaluate(
    () => document.body.innerText + JSON.stringify(localStorage),
  );
  assert.ok(!forbidden.some((value) => documentSnapshot.includes(value)));

  // Backup takes editor-created local-only history and unsaved-to-Git source to another DATA root.
  await checked(ws + '/git/stage', 'POST', { paths: ['edit.txt'] });
  const localCommit = (
    await checked(ws + '/git/commit', 'POST', {
      message: 'local-only editor commit',
    })
  ).sha;
  await checked(ws + '/files', 'POST', {
    path: 'untracked-backup',
    content: 'workspace backup content',
    must_not_exist: true,
  });
  const old = await checked(ws + '/files?path=edit.txt');
  await checked(ws + '/files', 'PUT', {
    path: 'edit.txt',
    content: 'dirty backed up\n',
    expected_hash: old.hash,
  });
  await page.goto(base + '/setting');
  await page.getByRole('tab', { name: '备份与恢复', exact: true }).click();
  await page.getByRole('button', { name: '创建备份', exact: true }).click();
  await until(async () =>
    (await checked('/backups')).some((b) => b.status === 'READY'),
  );
  const backup = (await checked('/backups'))[0];
  mark('browser-backup-includes-editor-state');
  await stop();
  const backupPhrase=acceptance.secret('workspace-backup-private-passphrase');
  const cli = (...args) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [path.join(root, 'static/build/backupCli.js'), ...args],
        { env, cwd: root, stdio: ['pipe', 'pipe', 'pipe'], input: backupPhrase },
      ).toString(),
    );
  const exported = cli('export', backup.id, );
  const portable = path.join(tmp, 'portable.backup');
  const exportsDir = path.join(env.QL_DATA_DIR + '-backups', 'exports');
  const exportedFiles = fs.readdirSync(exportsDir);
  assert.equal(exportedFiles.length, 1);
  fs.copyFileSync(path.join(exportsDir, exportedFiles[0]), portable);
  const original = env.QL_DATA_DIR;
  env.QL_DATA_DIR = path.join(tmp, 'restored-B');
  const imported = cli('import', portable, ).data
    .import_id;
  cli('stage', imported, '--import');
  await start();
  await page.evaluate(() => localStorage.removeItem('token'));
  await page.goto(base + '/login');
  await login();
  assert.equal((await checked('/restore/status')).stage, 'COMPLETE');
  assert.equal((await checked(ws)).head, localCommit);
  assert.equal(
    (await checked(ws + '/files?path=edit.txt')).content,
    'dirty backed up\n',
  );
  assert.equal(
    (await checked(ws + '/files?path=untracked-backup')).content,
    'workspace backup content',
  );
  assert.notEqual(env.QL_DATA_DIR, original);
  mark('different-root-restore-preserves-editor-local-commit-dirty-untracked');
  await page.goto(base + `/workspace?id=${wt.id}`);
  await page.getByRole('button', { name: 'edit.txt', exact: true }).click();
  await page.screenshot({
    path: path.join(evidenceDirectory, 'browser-workspace.png'),
    fullPage: true,
  });
  assert.deepEqual(leaks, []);
  evidence.security = {
    api_responses: inspected.length,
    websocket_frames: websocketFrames,
    leaks: 0,
  };
  evidence.status = 'PASS';
})()
  .catch(async (e) => {
    evidence.status = 'FAIL';
    evidence.error = e.stack;
    console.error(e);
    if (page)
      await page
        .screenshot({
          path: path.join(evidenceDirectory, 'browser-failure.png'),
          fullPage: true,
        })
        .catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    flushBrowser();await browser?.close();
    await stop();
    for (const c of connections) c.destroy();
    await new Promise((r) => (ssh ? ssh.close(r) : r()));
    fs.writeFileSync(
      path.join(evidenceDirectory, 'browser-e2e.json'),
      JSON.stringify(evidence, null, 2),
    );
    fs.writeFileSync(
      path.join(evidenceDirectory, 'browser-backend.log'),
      output.replace(/(private_key|token|password)[^\n]*/gi, '[redacted]'),
    );
    fs.rmSync(tmp, { recursive: true, force: true });
  });
