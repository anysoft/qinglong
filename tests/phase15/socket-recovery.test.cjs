const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), net = require('node:net');
const { fork } = require('node:child_process'), { once } = require('node:events');
const { fixture, task } = require('../phase10/helpers.cjs');
test('real submission socket permissions, concurrent access, owner SIGKILL and stale socket restart', async t => {
  const h = await fixture(t), f = await task(h, 'printf hello', { concurrency: 'QUEUE' });
  const socket = h.load('back/shared/executionSocket.ts').executionSocketAddress(h.root);
  async function start() {
    const child = fork(path.join(__dirname, 'socket-worker.cjs'), [h.root], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; } });
    const [message] = await once(child, 'message');
    assert.deepEqual(message, { ready: true });
    return child;
  }
  const send = text => new Promise((resolve, reject) => {
    const client = net.createConnection(socket); let output = '';
    client.setTimeout(5000, () => client.destroy(Error('socket request timeout')));
    client.on('error', reject); client.on('data', chunk => { output += chunk; });
    client.on('connect', () => client.write(text)); client.on('end', () => resolve(output));
  });
  const first = await start();
  assert.equal((await fs.stat(socket)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(socket))).mode & 0o777, 0o700);
  assert.equal(await send('not-a-task\n'), 'INVALID\n');
  t.diagnostic('malformed request rejected');
  const responses = await Promise.all(Array.from({ length: 20 }, () => send(f.definition.id + '\n')));
  assert.equal(new Set(responses.map(text => JSON.parse(text).id)).size, 20);
  assert.equal(await h.TaskRunModel.count(), 20);
  t.diagnostic('20 concurrent submissions persisted');
  const exited = once(first, 'exit'); first.kill('SIGKILL'); await exited;
  assert.ok((await fs.lstat(socket)).isSocket());
  const second = await start();
  assert.equal(JSON.parse(await send(f.definition.id + '\n')).status, 'QUEUED');
  assert.equal(await h.TaskRunModel.count(), 21);
  const stopped = once(second, 'exit'); second.send('stop'); await stopped;
  await assert.rejects(fs.lstat(socket), { code: 'ENOENT' });
});
