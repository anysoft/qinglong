// Isolated real API/services/local Git/SQLite; scheduler transport is a test double.
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  express = require('express');
const { Container } = require('typedi'),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const setup = require('../../tests/phase3/helpers.cjs');
(async () => {
  const cleanup = [];
  const x = await setup({ after: (fn) => cleanup.push(fn) });
  let browser, server;
  try {
    const Managed = x.get('services/managedSubscription').default,
      Resolver = x.get('services/subscriptionGit').default,
      Cron = x.get('services/cron').default,
      Sub = x.get('services/subscription').default;
    const resolver = new Resolver(),
      managed = new Managed(x.storage, x.worktrees, resolver),
      logger = { info() {}, error() {}, warn() {} };
    const cron = new Cron(logger),
      subs = new Sub(
        logger,
        { cancelCronTask() {}, async createCronTask() {} },
        { sendMessage() {} },
        { async setSshConfig() {} },
        cron,
      );
    Container.set('logger', logger);
    Container.set(Managed, managed);
    Container.set(Resolver, resolver);
    Container.set(Cron, cron);
    Container.set(Sub, subs);
    Container.set(x.get('services/repositoryStorage').default, x.storage);
    Container.set(x.get('services/worktree').default, x.worktrees);
    // Production scheduler launches gitSubscription.ts. This in-process bridge lets
    // the browser exercise its real Managed pipeline against an in-memory fixture DB.
    subs.run = async (ids) => {
      for (const id of ids) await managed.run(id);
    };
    await fs.writeFile(
      path.join(x.origin, 'job.js'),
      '// cron: 0 8 * * *\nconsole.log("browser");\n',
    );
    x.git('add', '.');
    x.git('commit', '-qm', 'browser script');
    const app = express();
    app.use(express.json());
    app.get('/api/env.js', (_, res) =>
      res.type('js').send('window.__ENV__QlBaseUrl="/";'),
    );
    for (const [url, data] of Object.entries({
      health: { status: 'ok' },
      system: { isInitialized: true, version: 'phase3-test' },
      user: { username: 'Phase3 QA' },
      'system/config': { info: { lang: 'zh' } },
    }))
      app.get('/api/' + url, (_, res) => res.json({ code: 200, data }));
    app.get('/api/repositories', async (_, res) =>
      res.json({ code: 200, data: await x.repositories.list() }),
    );
    app.get('/api/git-credentials', async (_, res) =>
      res.json({ code: 200, data: [] }),
    );
    app.get('/api/repositories/:id', async (req, res) =>
      res.json({
        code: 200,
        data: await x.repositories.detail(Number(req.params.id)),
      }),
    );
    const api = express.Router();
    x.get('api/subscription').default(api);
    x.get('api/workspace').default(api);
    app.use('/api', api);
    app.use((err, req, res, next) =>
      res
        .status(err.status || 400)
        .json({
          code: err.status || 400,
          error_code: err.error_code,
          message: err.message,
        }),
    );
    app.use(express.static(path.resolve('static/dist')));
    app.get('*', (_, res) =>
      res.sendFile(path.resolve('static/dist/index.html')),
    );
    server = app.listen(0, '127.0.0.1');
    require('sockjs')
      .createServer({ log() {} })
      .installHandlers(server, { prefix: '/api/ws' });
    await new Promise((r) => server.once('listening', r));
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({
      viewport: { width: 1560, height: 1100 },
    });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem('token', 'isolated-phase3');
      localStorage.setItem('lang', 'zh');
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/subscription');
    await page.getByRole('button', { name: /创建订阅/ }).click();
    let modal = page.getByRole('dialog');
    await modal.getByLabel('名称', { exact: true }).fill('Browser Managed');
    await modal.getByLabel('Existing Repository', { exact: true }).check();
    await modal.getByLabel('Repository', { exact: true }).click();
    await page
      .getByText('Fixture · https://fixture.invalid/team/project.git', {
        exact: true,
      })
      .click();
    await modal.getByLabel('Managed（持久工作区）', { exact: true }).check();
    await modal.getByLabel('分支', { exact: true }).fill('main');
    await modal.getByLabel('定时规则', { exact: true }).fill('0 8 * * *');
    const create = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/subscriptions' &&
        r.request().method() === 'POST',
    );
    await modal.getByRole('button', { name: /确.*定/ }).click();
    assert.equal((await create).status(), 200);
    await modal.waitFor({ state: 'hidden' });
    const sub = await x.SubscriptionModel.findOne({
      where: { name: 'Browser Managed' },
    });
    assert.equal(sub.git_mode, 'MANAGED');
    assert.ok(sub.worktree_id);
    await page.getByText('MANAGED', { exact: true }).waitFor();
    const run = page.waitForResponse(
      (r) =>
        r.url().includes('/subscriptions/run') &&
        r.request().method() === 'PUT',
    );
    await page.getByText('运行', { exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /确.*定/ })
      .click();
    assert.equal((await run).status(), 200);
    await page.reload();
    await page.getByText('SUCCESS', { exact: true }).waitFor();
    assert.equal(await x.CrontabModel.count(), 1);
    const repeat = page.waitForResponse(
      (r) =>
        r.url().includes('/subscriptions/run') &&
        r.request().method() === 'PUT',
    );
    await page.getByText('运行', { exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /确.*定/ })
      .click();
    assert.equal((await repeat).status(), 200);
    await page.reload();
    assert.equal(await x.CrontabModel.count(), 1);
    await page.locator('[aria-label="ellipsis"]').click();
    await page.getByRole('menuitem', { name: /编辑/ }).click();
    modal = page.getByRole('dialog');
    const preflight = page.waitForResponse((r) =>
      r.url().includes('/managed/preflight'),
    );
    await modal
      .getByRole('button', { name: '检查已保存配置的 Managed 就绪状态' })
      .click();
    assert.equal((await preflight).status(), 200);
    await modal.getByRole('button', { name: /取.*消/ }).click();

    const wt = await x.WorktreeModel.findByPk(sub.worktree_id);
    await fs.writeFile(
      path.join(wt.local_path, 'job.js'),
      'dirty browser edit',
    );
    const fail = await page.request.put(base + '/api/subscriptions/run', {
      data: [sub.id],
    });
    assert.equal(fail.status(), 409);
    await page.reload();
    await page.getByText('FAILED', { exact: true }).waitFor();
    assert.match(
      await fs.readFile(
        path.join(x.dir, 'scripts/team_project_main/job.js'),
        'utf8',
      ),
      /browser/,
    );
    await page
      .getByRole('link', { name: `Worktree #${sub.worktree_id}`, exact: true })
      .click();
    await page.getByRole('tab', { name: 'Worktrees', exact: true }).click();
    await page
      .getByText(`Browser Managed #${sub.id}`, { exact: true })
      .waitFor();
    await page.goto(base + '/subscription');
    await page.locator('[aria-label="ellipsis"]').click();
    await page.getByRole('menuitem', { name: /编辑/ }).click();
    modal = page.getByRole('dialog');
    await modal.getByLabel('Legacy（重新克隆）', { exact: true }).check();
    const rollback = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === '/api/subscriptions' &&
        r.request().method() === 'PUT',
    );
    await modal.getByRole('button', { name: /确.*定/ }).click();
    assert.equal((await rollback).status(), 200);
    await modal.waitFor({ state: 'hidden' });
    await page.getByText('LEGACY', { exact: true }).waitFor();
    assert.ok(await x.WorktreeModel.findByPk(sub.worktree_id));
    assert.deepEqual(errors, []);
    await page.screenshot({
      path: path.resolve('diagnostics/phase3/subscription.png'),
      fullPage: true,
    });
    console.log(
      JSON.stringify(
        {
          result: 'PASS',
          checks: [
            'Managed create via UI',
            'preflight binding and explicit UI check',
            'repeat run without changes',
            'UI run with real Git pipeline',
            'SUCCESS/FAILED state',
            'dirty preservation',
            'worktree reference navigation',
            'explicit Legacy rollback',
          ],
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser?.close();
    if (server) await new Promise((r) => server.close(r));
    for (const fn of cleanup.reverse()) await fn();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
