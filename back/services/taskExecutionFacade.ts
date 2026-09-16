import {selectRows} from './runObservability';
import { executionService } from './executionService';
/** Task API owns this read/command facade; TaskRuns owns all execution facts.
 * Commands submit/cancel durable runs and never consult scheduler projections.
 */
export default class TaskExecutionFacade {
  async statuses(ids: number[]) {
    const rows = ids.length ? await selectRows('SELECT r.id,r.task_id,r.status,r.attempt_count FROM TaskRuns r JOIN (SELECT MAX(id) id FROM TaskRuns WHERE task_id IN (:ids) GROUP BY task_id) latest ON latest.id=r.id', {ids}) : [];
    const result = new Map<
      number,
      { id: number; status: string; attempt_count: number }
    >();
    for (const row of rows)
      if (row.task_id && !result.has(row.task_id))
        result.set(row.task_id, {
          id: row.id,
          status: row.status,
          attempt_count: row.attempt_count,
        });
    return result;
  }
  async run(id: number) {
    return executionService.submit(id, 'MANUAL');
  }
  async stop(id: number) {
    return executionService.cancelTask(id);
  }
  async log(id: number) {
    const run = (await executionService.list(id))[0];
    return {
      content: run ? await executionService.log(run.id) : '',
      run: run ?? null,
    };
  }
  async logs(id: number) {
    return executionService.list(id);
  }
}
