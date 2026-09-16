import PQueue, { QueueAddOptions } from 'p-queue-cjs';
import os from 'os';
import { ISchedule, IScheduleFn } from './interface';

/** Internal operation queues. TaskRun dispatch and concurrency belong to ExecutionService. */
class TaskLimit {
  private subscriptionLimit = new PQueue({ concurrency: Math.max(os.cpus().length, 4) });
  public async runWithSubscriptionLimit<T>(
    schedule: ISchedule,
    fn: IScheduleFn<T>,
    options?: Partial<QueueAddOptions>,
  ): Promise<T | void> {
    fn.schedule = schedule;
    return this.subscriptionLimit.add(fn, options);
  }

}

export default new TaskLimit();
