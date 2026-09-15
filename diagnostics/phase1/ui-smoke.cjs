// Optional browser check: build:front first, set PLAYWRIGHT_MODULE to an installed playwright package.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { Sequelize, Transaction } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
require('reflect-metadata');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { Container } = require('typedi');
(async () => {
  const database = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
    transactionType: Transaction.TYPES.IMMEDIATE,
  });
  let browser, server;
  try {
    class SubscriptionService {
      async handleTask() {}
    }
    const mocks = {
      '.': { sequelize: database },
      '../data': { sequelize: database },
      '../services/subscription': SubscriptionService,
    };
    const cache = new Map();
    const get = (f) => load(path.resolve('back/' + f + '.ts'), mocks, cache);
    const Secret = get('services/credentialSecret').default,
      Resolver = get('services/gitCredentialResolver').default,
      Credentials = get('services/gitCredential').default,
      Repositories = get('services/repository').default,
      Subs = get('services/subscriptionGit').default;
    const secrets = new Secret(),
      resolver = new Resolver();
    Container.set(Credentials, new Credentials(secrets, resolver));
    Container.set(Repositories, new Repositories(secrets, resolver));
    Container.set(Subs, new Subs());
    Container.set(SubscriptionService, new SubscriptionService());
    await database.sync();
    const app = express();
    app.use(express.json());
    app.get('/api/env.js', (_, res) =>
      res.type('js').send('window.__ENV__QlBaseUrl="/";'),
    );
    for (const [url, data] of Object.entries({
      health: { status: 'ok' },
      system: { isInitialized: true, version: 'phase1-test' },
      user: { username: 'Phase1 QA' },
      'system/config': { info: { lang: 'zh' } },
      subscriptions: [],
    }))
      app.get('/api/' + url, (_, res) => res.json({ code: 200, data }));
    const api = express.Router();
    get('api/gitResources').default(api);
    app.use('/api', api);
    app.use(express.static(path.resolve('static/dist')));
    app.get('*', (_, res) =>
      res.sendFile(path.resolve('static/dist/index.html')),
    );
    server = app.listen(0, '127.0.0.1');
    require('sockjs').createServer({log:()=>{}}).installHandlers(server,{prefix:'/api/ws'});
    await new Promise((r) => server.once('listening', r));
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1050 },
    });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem('token', 'isolated-ui-test');
      localStorage.setItem('lang', 'zh');
    });
    const url = 'http://127.0.0.1:' + server.address().port;
    await page.goto(url + '/repository');
    await page
      .getByRole('heading', { name: '仓库管理', exact: true })
      .waitFor();
    await page.getByRole('tab', { name: 'Credentials / 凭证' }).click();
    await page.getByRole('button', { name: '创建凭证', exact: true }).click();
    let modal = page.getByRole('dialog');
    await modal.getByLabel('名称', { exact: true }).fill('UI token');
    await modal.getByLabel('认证方式', { exact: true }).press('Enter');
    await page.getByText('https_token', { exact: true }).last().click();
    await modal
      .getByLabel('Token', { exact: true })
      .fill('ui-test-secret-never-echo');
    await modal.getByRole('button', { name: /确.*定/ }).click();
    await page.getByRole('cell', { name: 'UI token', exact: true }).waitFor();
    assert.equal(
      (await page.locator('body').innerText()).includes(
        'ui-test-secret-never-echo',
      ),
      false,
    );
    await page.getByRole('button', { name: /编\s*辑/ }).click();
    modal = page.getByRole('dialog');
    await modal.getByText('保持现有 Secret', { exact: true }).waitFor();
    assert.equal(await modal.locator('input[type=password]').count(), 0);
    await modal.getByRole('button', { name: /取.*消/ }).click();
    await page.getByRole('tab', { name: 'Repositories / 仓库' }).click();
    await page.getByRole('button', { name: '创建仓库', exact: true }).click();
    modal = page.getByRole('dialog');
    await modal.getByLabel('名称', { exact: true }).fill('UI repository');
    await modal
      .getByLabel('Remote URL', { exact: true })
      .fill('https://github.com/anysoft/test.git');
    await modal.getByLabel('名称', { exact: true }).click();
    await modal.getByText('github · github.com', { exact: true }).waitFor();
    await modal.getByLabel('默认凭证', { exact: true }).press('Enter');
    await page
      .getByText('UI token (https_token, enabled)', { exact: true })
      .last()
      .click();
    await modal.getByRole('button', { name: /确.*定/ }).click();
    await page
      .getByRole('cell', { name: 'UI repository', exact: true })
      .waitFor();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.screenshot({
      path: process.env.UI_SCREENSHOT || '/tmp/ql-phase1-ui.png',
      fullPage: true,
    });
    const records = await Container.get(Repositories).list();
    assert.equal(records.length, 1);
    assert.equal(records[0].default_credential_id, 1);
    await page.goto(url + '/subscription');
    await page.getByRole('button', { name: /创建订阅/ }).click();
    modal = page.getByRole('dialog');
    await modal.getByText('Existing Repository', { exact: true }).click();
    await modal.getByLabel('Repository', { exact: true }).press('Enter');
    await page
      .getByText('UI repository · https://github.com/anysoft/test.git', {
        exact: true,
      })
      .last()
      .click();
    assert.equal(
      await modal.getByLabel('链接', { exact: true }).inputValue(),
      'https://github.com/anysoft/test.git',
    );
    await modal.getByText('Manual URL (Legacy)', { exact: true }).click();
    await modal
      .getByLabel('链接', { exact: true })
      .waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    console.log(
      'UI smoke PASS: credential create/retain, secret masking, repository parse/create/default binding, subscription source selector and legacy fallback',
    );
  } finally {
    await browser?.close();
    if (server) await new Promise((r) => server.close(r));
    await database.close();
    Container.reset();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
