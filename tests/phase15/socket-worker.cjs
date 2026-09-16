const { attach } = require('../phase10/attach.cjs');
(async () => {
  const h = await attach(process.argv[2]);
  const Server = h.load('back/services/executionSubmission.ts').ExecutionSubmissionServer;
  const server = new Server(h.execution);
  await server.start();
  process.send({ ready: true });
  process.on('message', async message => {
    if (message === 'stop') { await server.stop(); await h.close(); process.disconnect(); }
  });
})().catch(error => { process.send?.({ error: error.code || error.message }); process.exitCode = 1; process.disconnect?.(); });
