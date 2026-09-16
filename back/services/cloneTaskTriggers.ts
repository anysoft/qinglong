import { randomUUID } from 'crypto';
import { Transaction } from 'sequelize';
import {
  TaskTriggerModel,
  CronTriggerModel,
  WebhookTriggerModel,
  GitUpdateTriggerModel,
} from '../data/taskTrigger';
import {
  newWebhookSecret,
  secretDigest,
  cronNext,
} from '../shared/triggerDefinition';
export async function cloneTaskTriggers(
  from: number,
  to: number,
  transaction: Transaction,
) {
  const originals = await TaskTriggerModel.findAll({
    where: { task_id: from },
    transaction,
  });
  const secrets: Array<{
    trigger_id: number;
    public_id: string;
    secret: string;
  }> = [];
  for (const original of originals) {
    const trigger = await TaskTriggerModel.create(
      {
        task_id: to,
        type: original.type,
        origin: 'USER',
        enabled: original.enabled,
        discovery_key: null,
      },
      { transaction },
    );
    if (original.type === 'CRON') {
      const cron = await CronTriggerModel.findByPk(original.id, {
        transaction,
      });
      if (!cron) throw Error('TRIGGER_CONFIG_MISSING');
      await CronTriggerModel.create(
        {
          trigger_id: trigger.id,
          expression: cron.expression,
          timezone: cron.timezone,
          misfire_policy: cron.misfire_policy,
          next_fire_at: cronNext(cron.expression, cron.timezone, new Date()),
        },
        { transaction },
      );
    } else if (original.type === 'WEBHOOK') {
      const secret = newWebhookSecret(),
        publicId = randomUUID();
      await WebhookTriggerModel.create(
        {
          trigger_id: trigger.id,
          public_id: publicId,
          secret_hash: secretDigest(secret),
        },
        { transaction },
      );
      secrets.push({ trigger_id: trigger.id, public_id: publicId, secret });
    } else {
      const git = await GitUpdateTriggerModel.findByPk(original.id, {
        transaction,
      });
      if (!git) throw Error('TRIGGER_CONFIG_MISSING');
      await GitUpdateTriggerModel.create(
        {
          trigger_id: trigger.id,
          mode: git.mode,
          path_filters: git.path_filters,
          fire_on_initial: git.fire_on_initial,
        },
        { transaction },
      );
    }
  }
  return secrets;
}
