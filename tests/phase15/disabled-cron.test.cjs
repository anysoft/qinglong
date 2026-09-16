const test = require('node:test'),
  assert = require('node:assert/strict');
const { fixture, task } = require('../phase10/helpers.cjs');

test('disabled Cron never schedules, survives scheduler restart and reenables without replay', async (t) => {
  const h = await fixture(t),
    { definition } = await task(h);
  let now = new Date('2030-03-01T00:00:00Z');
  const Service = h.load('back/services/taskTrigger.ts').default;
  const service = new Service(() => now);
  const Events = h.load('back/services/triggerEvents.ts').default;
  const Scheduler = h.load('back/services/triggerScheduler.ts').default;
  const config = {
    expression: '* * * * *',
    timezone: 'UTC',
    misfire_policy: 'FIRE_ONCE',
  };
  const row = await service.save(definition.id, { type: 'CRON', config });
  const disabled = await service.save(
    definition.id,
    { type: 'CRON', enabled: false, config, expected_version: row.version },
    row.id,
  );
  const inactive = new Date(disabled.config.next_fire_at).getTime();
  now = new Date('2030-03-02T12:00:00Z');
  for (let i = 0; i < 3; i++)
    await new Scheduler({ now: () => now }, new Events(h.execution)).tick();
  assert.equal(await h.TriggerEventModel.count(), 0);
  assert.equal(await h.TaskRunModel.count(), 0);
  assert.equal(
    new Date(
      (await h.CronTriggerModel.findByPk(row.id)).next_fire_at,
    ).getTime(),
    inactive,
  );
  const enabled = await service.save(
    definition.id,
    { type: 'CRON', enabled: true, config, expected_version: disabled.version },
    row.id,
  );
  assert.equal(
    new Date(enabled.config.next_fire_at).toISOString(),
    '2030-03-02T12:01:00.000Z',
  );
  const scheduler = new Scheduler({ now: () => now }, new Events(h.execution));
  await scheduler.tick();
  assert.equal(await h.TriggerEventModel.count(), 0);
  now = new Date('2030-03-02T12:01:00Z');
  await scheduler.tick();
  await scheduler.tick();
  assert.equal(await h.TriggerEventModel.count(), 1);
  assert.equal(await h.TaskRunModel.count(), 1);
});

test('disabled due rows cannot starve enabled Cron behind the scheduler batch limit', async (t) => {
  const h = await fixture(t),
    { definition } = await task(h);
  const Service = h.load('back/services/taskTrigger.ts').default,
    service = new Service();
  const inactive = await h.TaskTriggerModel.bulkCreate(
    Array.from({ length: 501 }, () => ({
      task_id: definition.id,
      type: 'CRON',
      origin: 'USER',
      enabled: false,
    })),
  );
  await h.CronTriggerModel.bulkCreate(
    inactive.map((row) => ({
      trigger_id: row.id,
      expression: '* * * * *',
      timezone: 'UTC',
      misfire_policy: 'FIRE_ONCE',
      next_fire_at: new Date('2030-01-01'),
    })),
  );
  const active = await service.save(definition.id, {
    type: 'CRON',
    config: {
      expression: '* * * * *',
      timezone: 'UTC',
      misfire_policy: 'FIRE_ONCE',
    },
  });
  const now = new Date('2030-03-01T00:00:00Z');
  await h.CronTriggerModel.update(
    { next_fire_at: now },
    { where: { trigger_id: active.id } },
  );
  const Events = h.load('back/services/triggerEvents.ts').default,
    Scheduler = h.load('back/services/triggerScheduler.ts').default;
  await new Scheduler({ now: () => now }, new Events(h.execution)).tick();
  const events = await h.TriggerEventModel.findAll();
  assert.equal(events.length, 1);
  assert.equal(events[0].trigger_id, active.id);
  assert.equal(await h.TaskRunModel.count(), 1);
});

test('ten real disable/tick process races serialize and disabled restart never emits later events', async (t) => {
  const path = require('node:path'),
    { spawn } = require('node:child_process');
  const h = await fixture(t),
    { definition } = await task(h);
  const service = new (h.load('back/services/taskTrigger.ts').default)();
  const config = {
    expression: '* * * * *',
    timezone: 'UTC',
    misfire_policy: 'FIRE_ONCE',
  };
  const worker = (file, args) =>
    new Promise((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [
          '-r',
          'ts-node/register/transpile-only',
          path.resolve(file),
          h.root,
          ...args,
        ],
        {
          env: {
            ...process.env,
            TS_NODE_PROJECT: path.resolve('back/tsconfig.json'),
          },
          stdio: ['ignore', 'ignore', 'pipe'],
        },
      );
      let error = '';
      p.stderr.on('data', (b) => (error += b));
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(Error(error))));
    });
  for (let i = 0; i < 10; i++) {
    const trigger = await service.save(definition.id, { type: 'CRON', config });
    const now = '2030-03-01T00:00:00Z';
    await h.CronTriggerModel.update(
      { next_fire_at: new Date(now) },
      { where: { trigger_id: trigger.id } },
    );
    await Promise.all([
      worker('tests/phase11/scheduler-worker.cjs', [now]),
      worker('tests/phase15/disable-worker.cjs', [
        String(definition.id),
        String(trigger.id),
      ]),
    ]);
    const before = await h.TriggerEventModel.count({
      where: { trigger_id: trigger.id },
    });
    assert.ok(before <= 1);
    await worker('tests/phase11/scheduler-worker.cjs', [
      '2030-03-02T00:00:00Z',
    ]);
    assert.equal(
      await h.TriggerEventModel.count({ where: { trigger_id: trigger.id } }),
      before,
    );
  }
});
