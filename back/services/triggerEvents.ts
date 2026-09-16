import { PlatformMutation } from './backup/platform';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { TaskTriggerModel, TriggerEventModel } from '../data/taskTrigger';
import { TriggerError } from '../shared/triggerDefinition';
import type ExecutionService from './executionService';

/** Durable inbox; execution remains owned exclusively by ExecutionService. */
export default class TriggerEvents {
  constructor(readonly execution?: ExecutionService) {}
  @PlatformMutation()
  async receive(
    triggerId: number,
    eventKey: string,
    metadata: Record<string, unknown> = {},
    skippedCode?: string,
    transaction?: Transaction,
  ) {
    if (!/^[A-Za-z0-9:_-]{1,255}$/.test(eventKey))
      throw new TriggerError('TRIGGER_EVENT_KEY_INVALID');
    // Callers construct safe metadata; incoming payloads never reach this API.
    if (
      Object.keys(metadata).some(
        (k) =>
          ![
            'scheduled_at',
            'repository_id',
            'worktree_id',
            'before',
            'after',
            'initial',
          ].includes(k),
      )
    )
      throw new TriggerError('TRIGGER_METADATA_INVALID');
    const receive = async (tx: Transaction) => {
      const existing = await TriggerEventModel.findOne({
        where: { trigger_id: triggerId, event_key: eventKey },
        transaction: tx,
      });
      if (existing) return existing;
      const trigger = await TaskTriggerModel.findByPk(triggerId, {
        transaction: tx,
      });
      if (!trigger) throw new TriggerError('TRIGGER_NOT_FOUND', 404);
      return TriggerEventModel.create(
        {
          trigger_id: triggerId,
          task_id: trigger.task_id,
          trigger_type: trigger.type,
          event_key: eventKey,
          metadata,
          received_at: new Date(),
          status: skippedCode ? 'SKIPPED' : 'RECEIVED',
          error_code: skippedCode ?? null,
        },
        { transaction: tx },
      );
    };
    return transaction
      ? receive(transaction)
      : sequelize.transaction({ type: Transaction.TYPES.IMMEDIATE }, receive);
  }
  async dispatch(id: number) {
    const event = await TriggerEventModel.findByPk(id);
    if (!event) throw new TriggerError('TRIGGER_EVENT_NOT_FOUND', 404);
    if (!['RECEIVED', 'PROCESSING'].includes(event.status)) return event;
    if (!event.task_id) {
      await event.update({ status: 'SKIPPED', error_code: 'TASK_DELETED' });
      return event;
    }
    // Run creation, unique identity, readiness check and event linkage share one
    // IMMEDIATE transaction inside submit. A crash rolls back all or none.
    const execution =
      this.execution ?? (await import('./executionService')).executionService;
    await execution.submit(event.task_id, event.trigger_type, event.id);
    return TriggerEventModel.findByPk(id);
  }
  @PlatformMutation()
  async recover(limit = 100) {
    const pending = await TriggerEventModel.findAll({
      where: { status: ['RECEIVED', 'PROCESSING'] },
      order: [['id', 'ASC']],
      limit,
    });
    for (const event of pending) await this.dispatch(event.id);
  }
}
