// Build the UI first. Uses local Git, real workspace API/services and a temporary SQLite database.
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  express = require('express');
const { Container } = require('typedi');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const setup = require('../../tests/phase2/helpers.cjs');
(async () => {
  const cleanup = [];
  const x = await setup({ after: (fn) => cleanup.push(fn) });
  let browser, server, page;
  try {
    Container.set(x.get('services/repositoryStorage').default, x.storage);
    Container.set(x.get('services/worktree').default, x.worktrees);
    const app = express();
    app.use(express.json());
    app.get('/api/env.js', (_, res) =>
      res.type('js').send('window.__ENV__QlBaseUrl="/";'),
    );
    for (const [url, data] of Object.entries({
      health: { status: 'ok' },
      system: { isInitialized: true, version: 'phase2-test' },
      user: { username: 'Phase2 QA' },
      'system/config': { info: { lang: 'zh' } },
    }))
      app.get('/api/' + url, (_, res) => res.json({ code: 200, data }));
    app.get('/api/repositories', async (_, res) =>
      res.json({ code: 200, data: await x.repositories.list() }),
    );
    app.get('/api/git-credentials', async (_, res) =>
      res.json({ code: 200, data: await x.credentials.list() }),
    );
    app.get('/api/repositories/:id', async (req, res) =>
      res.json({
        code: 200,
        data: await x.repositories.detail(Number(req.params.id)),
      }),
    );
    const api = express.Router();
    x.get('api/workspace').default(api);
    app.use('/api', api);
    app.use(express.static(path.resolve('static/dist')));
    app.get('*', (_, res) =>
      res.sendFile(path.resolve('static/dist/index.html')),
    );
    server = app.listen(0, '127.0.0.1');
    require('sockjs')
      .createServer({ log: () => {} })
      .installHandlers(server, { prefix: '/api/ws' });
    await new Promise((r) => server.once('listening', r));
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    page = await browser.newPage({ viewport: { width: 1560, height: 1100 } });
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', (e) => {
      errors.push(e.message);
      console.error('PAGE', e.message);
    });
    await page.addInitScript(() => {
      localStorage.setItem('token', 'isolated-phase2-test');
      localStorage.setItem('lang', 'zh');
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/repository');
    await page.getByRole('link', { name: '工作区', exact: true }).click();
    async function operation(pathPart, click, method = 'POST') {
      const response = page.waitForResponse(
        (r) => r.url().includes(pathPart) && r.request().method() === method,
        { timeout: 15000 },
      );
      const [r] = await Promise.all([response, click()]);
      return { status: r.status(), body: await r.json() };
    }
    assert.equal(
      (
        await operation('/initialize', () =>
          page.getByRole('button', { name: 'Initialize', exact: true }).click(),
        )
      ).status,
      200,
    );
    await page
      .getByRole('tab', { name: 'Refs / Branches', exact: true })
      .click();
    const main = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'main', exact: true }) });
    await main
      .getByRole('button', { name: 'Create Worktree', exact: true })
      .click();
    let modal = page.getByRole('dialog');
    await modal.getByLabel('名称', { exact: true }).fill('Browser Main');
    assert.equal(
      (
        await operation('/api/worktrees', () =>
          modal.getByRole('button', { name: /确.*定/ }).click(),
        )
      ).status,
      200,
    );
    await modal.waitFor({ state: 'hidden' });
    await page.getByRole('tab', { name: 'Worktrees', exact: true }).click();
    const row = page.getByRole('row').filter({
      has: page.getByRole('cell', { name: 'Browser Main', exact: true }),
    });
    await row.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByText('Changed Files', { exact: true })
      .waitFor();
    await page.getByRole('dialog').locator('.ant-modal-close').click();
    await page.waitForLoadState('networkidle');
    const wt = await x.WorktreeModel.findOne({
      where: { name: 'Browser Main' },
    });
    await fs.writeFile(
      path.join(x.origin, 'file.txt'),
      'browser remote update\n',
    );
    x.git('commit', '-am', 'browser update');
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    assert.equal(
      (
        await operation('/fetch', () =>
          page
            .locator('button')
            .filter({ hasText: /^Fetch$/ })
            .click(),
        )
      ).status,
      200,
    );
    await page.getByRole('tab', { name: 'Worktrees', exact: true }).click();
    assert.equal(
      (
        await operation(`/worktrees/${wt.id}/update`, () =>
          row.getByRole('button', { name: 'Update', exact: true }).click(),
        )
      ).status,
      200,
    );
    assert.equal(
      await fs.readFile(path.join(wt.local_path, 'file.txt'), 'utf8'),
      'browser remote update\n',
    );
    await fs.writeFile(
      path.join(wt.local_path, 'file.txt'),
      'unique dirty data\n',
    );
    const refused = await operation(`/worktrees/${wt.id}/update`, () =>
      row.getByRole('button', { name: 'Update', exact: true }).click(),
    );
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error_code, 'WORKTREE_DIRTY');
    await page.getByText(/工作区包含未提交/).waitFor();
    await row.getByRole('cell', { name: 'DIRTY', exact: true }).waitFor();
    await page.locator('.ant-message-notice').waitFor({ state: 'hidden' });
    await page.screenshot({
      path: '/tmp/ql-phase2-dirty-ui.png',
      fullPage: true,
    });
    const remove = () =>
      operation(
        `/worktrees/${wt.id}`,
        async () => {
          await row
            .getByRole('button', { name: 'Delete', exact: true })
            .click();
          await page.getByRole('button', { name: /确.*定/ }).click();
        },
        'DELETE',
      );
    assert.equal((await remove()).body.error_code, 'WORKTREE_DIRTY');
    assert.equal(
      await fs.readFile(path.join(wt.local_path, 'file.txt'), 'utf8'),
      'unique dirty data\n',
    );
    await fs.writeFile(
      path.join(wt.local_path, 'file.txt'),
      'browser remote update\n',
    );
    assert.equal((await remove()).status, 200);
    await row.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(
      'Phase2 browser PASS: list, initialize, fetch, refs, create/view/update/delete Worktree; dirty update/delete both refused without data loss.',
    );
  } catch (e) {
    if (page) {
      console.error('UI STATE', await page.locator('body').innerText());
      await page.screenshot({
        path: '/tmp/ql-phase2-ui-failure.png',
        fullPage: true,
      });
    }
    throw e;
  } finally {
    await browser?.close();
    if (server) await new Promise((r) => server.close(r));
    Container.reset();
    for (const fn of cleanup.reverse()) await fn();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
