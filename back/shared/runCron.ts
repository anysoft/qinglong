import { ICron } from '../protos/cron';
import { executionService } from '../services/executionService';
/** Scheduler transports only the Task identity; the command projection is ignored. */
export async function runCron(
  _command: string,
  cron: ICron,
): Promise<number | void> {
  const run = await executionService.submit(Number(cron.id), 'SCHEDULE');
  return run.id;
}
