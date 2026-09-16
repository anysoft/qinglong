// Exercise the actual persisted Trigger -> Event -> TaskRun path.
module.exports = async function submitCron(h, taskId) {
  const Service = h.load('back/services/taskTrigger.ts').default;
  const Events = h.load('back/services/triggerEvents.ts').default;
  const Scheduler = h.load('back/services/triggerScheduler.ts').default;
  const service = new Service(() => new Date('2030-01-01T00:00:00Z'));
  const config = { expression: '* * * * *', timezone: 'UTC', misfire_policy: 'FIRE_ONCE' };
  const trigger = await service.save(taskId, { type: 'CRON', config });
  await new Scheduler({ now: () => new Date('2030-01-01T00:01:00Z') }, new Events(h.execution)).tick();
  const run = await h.TaskRunModel.findOne({ where: { trigger_id: trigger.id } });
  require('node:assert/strict').ok(run, 'Cron must submit a durable TaskRun');
  await service.save(taskId, { type: 'CRON', config, enabled: false, expected_version: trigger.version }, trigger.id);
  return run.id;
};
