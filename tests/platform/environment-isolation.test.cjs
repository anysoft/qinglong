const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const setup = require('../phase4/helpers.cjs');
test('malformed scoped request JSON is never echoed by the HTTP error boundary', async t => {
  const h = await setup(t), express = require('express');
  const app = express(); app.use(express.json()); app.use(h.get('shared/scopedEnvHttp').scopedEnvironmentHttpError);
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); t.after(() => new Promise(r => server.close(r)));
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/scoped-env/profiles/1/variables`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"value":"private-malformed-secret",broken}' });
  const text = await r.text(); assert.equal(r.status, 400); assert.match(text, /ENV_REQUEST_INVALID/); assert.doesNotMatch(text, /private-malformed-secret/);
});
