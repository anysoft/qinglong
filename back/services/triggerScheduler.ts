import { PlatformMutation } from './backup/platform';
import { Op, Transaction, literal } from 'sequelize';
import { sequelize } from '../data';
import { CronTriggerModel } from '../data/taskTrigger';
import { cronNext } from '../shared/triggerDefinition';
import TriggerEvents from './triggerEvents';

export interface TriggerClock {
  now(): Date;
}
export default class TriggerScheduler {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly pending = new Set<Promise<void>>();
  constructor(
    readonly clock: TriggerClock = { now: () => new Date() },
    readonly events = new TriggerEvents(),
  ) {}
  @PlatformMutation()
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.clock.now();
      await sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        async (transaction) => {
          const due = await CronTriggerModel.findAll({
            where: {
              next_fire_at: { [Op.lte]: now },
              // Filter before LIMIT: dormant rows must never consume the batch.
              [Op.and]: literal(
                '"trigger_id" IN (SELECT "id" FROM "TaskTriggers" WHERE "enabled" = 1)',
              ),
            },
            order: [
              ['next_fire_at', 'ASC'],
              ['trigger_id', 'ASC'],
            ],
            limit: 500,
            transaction,
          });
          for (const cron of due) {
            const scheduled = new Date(cron.next_fire_at);
            const next = cronNext(cron.expression, cron.timezone, scheduled);
            const missed = next.getTime() <= now.getTime();
            await this.events.receive(
              cron.trigger_id,
              `cron:${scheduled.getTime()}`,
              { scheduled_at: scheduled.toISOString() },
              missed && cron.misfire_policy === 'SKIP'
                ? 'CRON_MISFIRE_SKIPPED'
                : undefined,
              transaction,
            );
            await cron.update(
              {
                last_fire_at: scheduled,
                next_fire_at: missed
                  ? cronNext(cron.expression, cron.timezone, now)
                  : next,
              },
              { transaction },
            );
          }
        },
      );
      await this.events.recover();
    } finally {
      this.running = false;
    }
  }
  start() {
    if (this.timer) return;
    const schedule = () => {
      let pending: Promise<void>;
      pending = this.tick()
        .catch(() => console.error('TRIGGER_SCHEDULER_TICK_FAILED'))
        .finally(() => this.pending.delete(pending));
      this.pending.add(pending);
    };
    this.timer = setInterval(schedule, 1000);
    this.timer.unref();
    schedule();
  }
  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await Promise.all([...this.pending]);
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
export const triggerScheduler = new TriggerScheduler();
