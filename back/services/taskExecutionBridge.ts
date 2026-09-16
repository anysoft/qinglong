import { Container } from 'typedi';
import CurrentTaskBridgeService from './cron';
import TaskResourceResolver from './taskResourceResolver';
import TaskExecutionSourceBridge from './taskExecutionSourceBridge';
import { TaskDefinitionError } from '../shared/taskDefinition';
import { SchedulerProjectionModel } from '../data/cron';

/** Current runner transport only. Phase 10 replaces this implementation. */
export default class TaskExecutionBridge {
  async statuses(ids: number[]) {
    const rows = await SchedulerProjectionModel.findAll({
      where: { id: ids },
      attributes: ['id', 'status', 'last_execution_time', 'last_running_time'],
    });
    return new Map(
      rows.map((row) => [
        row.id!,
        {
          status: row.status,
          last_execution_time: row.last_execution_time,
          last_running_time: row.last_running_time,
        },
      ]),
    );
  }
  async run(id: number) {
    const resources = await new TaskResourceResolver().detail(id, true);
    if (resources.readiness.status !== 'READY')
      throw new TaskDefinitionError('TASK_NOT_READY', 409);
    const projection = await new TaskExecutionSourceBridge().refresh(id);
    if (!projection.available)
      throw new TaskDefinitionError(projection.reason!, 409);
    return Container.get(CurrentTaskBridgeService).run([id]);
  }
  async stop(id: number) {
    return Container.get(CurrentTaskBridgeService).stop([id]);
  }
  async log(id: number) {
    return Container.get(CurrentTaskBridgeService).log(id);
  }
  async logs(id: number) {
    return Container.get(CurrentTaskBridgeService).logs(id);
  }
}
