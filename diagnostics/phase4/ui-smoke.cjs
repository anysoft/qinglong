const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), express = require('express');
const { spawn } = require('node:child_process'), { Container } = require('typedi');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const setup = require('../../tests/phase4/helpers.cjs');
(async () => {
  const cleanup = [], h = await setup({ after: fn => cleanup.push(fn), fileDatabase: true });
  let browser, server;
  try {
    for (const [module, instance] of [['repositoryEnvProfile', h.profiles], ['scopedEnvVariable', h.variables], ['taskEnvironmentResolver', h.resolver]]) Container.set(h.get('services/' + module).default, instance);
    const repo = await h.RepositoryModel.create({ name: 'Browser Repo', provider: 'generic', remote_url: 'https://browser.invalid/a', normalized_url: 'browser.invalid/a' });
    const sub = await h.SubscriptionModel.create({ name: 'Browser Sub', alias: 'browser', repository_id: repo.id, type: 'public-repo', url: repo.remote_url, schedule_type: 'crontab', schedule: '0 0 * * *', status: 1, git_mode: 'LEGACY' });
    const tasks = [];
    const secret = 'browser-private-four';
    const scripts = {
      js: `if(process.env.TOKEN!==${JSON.stringify(secret)} || process.env.PLAIN!=='task-value' || 'REMOVE' in process.env) process.exit(7); console.log('LANGUAGE_PASS'); console.log(process.env.TOKEN);`,
      py: `import os\nassert os.environ['TOKEN']==${JSON.stringify(secret)}\nassert os.environ['PLAIN']=='task-value'\nassert 'REMOVE' not in os.environ\nprint('LANGUAGE_PASS')\nprint(os.environ['TOKEN'])`,
      sh: `[[ "$TOKEN" == '${secret}' && "$PLAIN" == 'task-value' && -z \${REMOVE+x} ]] || exit 7\nprintf 'LANGUAGE_PASS\\n%s\\n' "$TOKEN"`,
    };
    for (const language of ['js', 'py', 'sh']) {
      tasks.push(await h.CrontabModel.create({ name: `Browser ${language}`, command: `task browser.${language}`, schedule: '0 0 * * *', sub_id: sub.id }));
      fs.writeFileSync(path.join(h.dir, `data/scripts/browser.${language}`), scripts[language]);
    }
    await h.EnvModel.create({ name: 'REMOVE', value: 'global', status: 0 }); await h.globals.set_envs();
    const app = express(); app.use(express.json());
    app.get('/api/env.js', (_, res) => res.type('js').send('window.__ENV__QlBaseUrl="/";'));
    for (const [url, data] of Object.entries({ health: { status: 'ok' }, system: { isInitialized: true, version: 'phase4' }, user: { username: 'Phase4 QA' }, 'system/config': { info: { lang: 'zh' } } })) app.get('/api/' + url, (_, res) => res.json({ code: 200, data }));
    const router = express.Router(); h.get('api/scopedEnvironment').default(router); app.use('/api', router);
    app.get('/api/subscriptions', async (_, res) => res.json({ code: 200, data: await h.SubscriptionModel.findAll() }));
    app.get('/api/repositories', async (_, res) => res.json({ code: 200, data: await h.RepositoryModel.findAll() }));
    app.get('/api/git-credentials', (_, res) => res.json({ code: 200, data: [] }));
    // Test scheduler bridge: real resolver + transport + unchanged task command arguments.
    app.put('/api/crons/run', async (req, res) => {
      try {
        const results = [];
        for (const id of req.body) {
          const task = await h.CrontabModel.findByPk(id), resolved = await h.resolver.resolve(id);
          const snapshot = await new (h.get('services/executionEnvironmentTransport').default)().prepare(resolved, process.pid);
          try {
            const output = await new Promise((resolve, reject) => {
              const cp = spawn('/bin/bash', [path.join(h.dir, 'shell/task.sh'), task.command.slice(5), 'now'], { env: { ...process.env, QL_DIR: h.dir, QL_DATA_DIR: path.join(h.dir, 'data'), ID: String(id), real_time: 'true', QL_TASK_ENV_SNAPSHOT: snapshot.directory } });
              let out = ''; cp.stdout.on('data', x => out += x); cp.stderr.on('data', x => out += x); cp.on('error', reject); cp.on('close', () => resolve(out));
            });
            assert.match(output, /LANGUAGE_PASS/); assert.ok(!output.includes(secret)); results.push({ id, result: 'PASS' });
          } finally { await snapshot.cleanup(); }
        }
        res.json({ code: 200, data: results });
      } catch (error) { res.status(400).json({ code: 400, message: /^ENV_/.test(error.message) ? error.message : 'EXECUTION_TEST_FAILED' }); }
    });
    app.use(express.static(path.resolve('static/dist'))); app.get('*', (_, res) => res.sendFile(path.resolve('static/dist/index.html')));
    server = app.listen(0, '127.0.0.1'); require('sockjs').createServer({ log() {} }).installHandlers(server, { prefix: '/api/ws' });
    await new Promise(r => server.once('listening', r));
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1560, height: 1100 } }); page.setDefaultTimeout(20000);
    const errors = [], responseChecks = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.url().includes('/api/scoped-env')) responseChecks.push(r.text().then(body => assert.ok(!body.includes(secret))).catch(e => { errors.push(e.message); })); });
    await page.addInitScript(() => { localStorage.setItem('token', 'phase4-fixture'); localStorage.setItem('lang', 'zh'); });
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/scoped-env?repository=' + repo.id);
    await page.getByRole('button', { name: '创建 Profile', exact: true }).click();
    let modal = page.getByRole('dialog'); await modal.getByLabel('Profile 名称').fill('prod'); await modal.getByRole('button', { name: /确.*定/ }).click(); await modal.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '设为 Default', exact: true }).click();
    await page.getByRole('button', { name: '变量', exact: true }).click();
    async function addVariable(name, value, isSecret = false, unset = false) {
      await page.getByRole('button', { name: '添加变量', exact: true }).click();
      const dialog = page.getByRole('dialog'); await dialog.getByLabel('变量名', { exact: true }).fill(name);
      if (unset) { await dialog.getByText('SET — 设置值', { exact: true }).click(); await page.getByText('UNSET — 从环境删除', { exact: true }).click(); }
      else { if (isSecret) await dialog.getByRole('switch').click(); await dialog.getByLabel(isSecret ? '新 Secret 值' : '值（允许空字符串）', { exact: true }).fill(value); }
      await dialog.getByRole('button', { name: /确.*定/ }).click(); await dialog.waitFor({ state: 'hidden' });
    }
    await addVariable('PLAIN', 'repo-value'); await addVariable('TOKEN', secret, true);
    await page.getByRole('button', { name: 'Clone', exact: true }).click(); modal = page.getByRole('dialog'); await modal.getByLabel('Clone 名称').fill('test'); await modal.getByRole('button', { name: /确.*定/ }).click(); await modal.waitFor({ state: 'hidden' });
    const p = await h.EnvironmentProfileModel.findOne({ where: { name: 'prod' } });
    await page.goto(base + '/subscription');
    await page.locator('[aria-label="ellipsis"]').click();
    await page.getByRole('menuitem', { name: /编辑/ }).click();
    await page.getByText('Inherit — Subscription / Repository Default', { exact: true }).click();
    const bound = page.waitForResponse(r => r.url().includes(`/subscriptions/${sub.id}/profile`) && r.request().method() === 'PUT');
    await page.getByText('prod (Default)', { exact: true }).click(); assert.equal((await bound).status(), 200);
    await page.getByRole('dialog').getByRole('button', { name: /取.*消/ }).click();
    await page.goto(`${base}/scoped-env?task=${tasks[0].id}`);
    await page.getByText('Inherit — Subscription / Repository Default', { exact: true }).waitFor();
    await addVariable('PLAIN', 'task-value'); await addVariable('REMOVE', '', false, true);
    await page.getByRole('button', { name: '预览有效环境' }).click(); await page.getByText('选择来源: SUBSCRIPTION', { exact: false }).waitFor();
    await page.getByText('Inherit — Subscription / Repository Default', { exact: true }).click();
    const taskBound = page.waitForResponse(r => r.url().includes(`/tasks/${tasks[0].id}/profile`) && r.request().method() === 'PUT');
    await page.getByText('prod (Default)', { exact: true }).click(); assert.equal((await taskBound).status(), 200);
    for (const task of tasks.slice(1)) await page.request.put(`${base}/api/scoped-env/tasks/${task.id}/variables`, { data: [{ name: 'PLAIN', value: 'task-value' }, { name: 'REMOVE', operation: 'UNSET' }] });
    const executed = await page.request.put(`${base}/api/crons/run`, { data: tasks.map(t => t.id) }); assert.equal(executed.status(), 200, await executed.text());
    await h.profiles.save({ id: p.id, status: 'disabled' });
    const failed = await page.request.put(`${base}/api/crons/run`, { data: [tasks[0].id] }); assert.equal(failed.status(), 400); assert.match(await failed.text(), /ENV_PROFILE_DISABLED/);
    await Promise.all(responseChecks); assert.deepEqual(errors, []);
    await page.screenshot({ path: path.resolve('diagnostics/phase4/scoped-env.png'), fullPage: true });
    console.log(JSON.stringify({ result: 'PASS', browser: 'Chrome', checks: ['profile create/default', 'plain/secret variable UI', 'clone', 'subscription binding UI', 'task inherit/explicit/override/unset/preview UI', 'actual Python/Node/Shell task.sh', 'secret-safe network and output', 'disabled profile fails'], pageErrors: errors }, null, 2));
  } finally { await browser?.close(); if (server) await new Promise(r => server.close(r)); for (const fn of cleanup.reverse()) await fn(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
