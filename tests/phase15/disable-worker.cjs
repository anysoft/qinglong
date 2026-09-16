require('reflect-metadata');
(async () => {
  const h = await require('../phase10/attach.cjs').attach(process.argv[2]);
  try {
    const Service = h.load('back/services/taskTrigger.ts').default;
    await new Service().save(
      Number(process.argv[3]),
      {
        type: 'CRON',
        enabled: false,
        expected_version: 1,
        config: {
          expression: '* * * * *',
          timezone: 'UTC',
          misfire_policy: 'FIRE_ONCE',
        },
      },
      Number(process.argv[4]),
    );
  } finally {
    await h.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
