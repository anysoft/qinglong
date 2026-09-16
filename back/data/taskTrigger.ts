import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';

export type TriggerType = 'CRON' | 'WEBHOOK' | 'GIT_UPDATE';
export type TriggerOrigin = 'USER' | 'DISCOVERY';
export type TriggerEventStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'SUBMITTED'
  | 'SKIPPED'
  | 'FAILED';
const id = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };
const text = (allowNull = false) => ({ type: DataTypes.STRING, allowNull });
const reference = (model: string, onDelete = 'CASCADE', allowNull = false) => ({
  type: DataTypes.INTEGER,
  allowNull,
  references: { model, key: 'id' },
  onDelete,
});
export interface TaskTrigger {
  id: number;
  task_id: number;
  type: TriggerType;
  origin: TriggerOrigin;
  enabled: boolean;
  version: number;
  discovery_key: string | null;
}
export const TaskTriggerModel = sequelize.define<
  Model<TaskTrigger, Partial<TaskTrigger>> & TaskTrigger
>(
  'TaskTrigger',
  {
    id,
    task_id: reference('Tasks'),
    type: text(),
    origin: { ...text(), defaultValue: 'USER' },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    // Retained when a user takes ownership; prevents discovery from recreating it.
    discovery_key: text(true),
  },
  {
    indexes: [
      { unique: true, fields: ['task_id', 'discovery_key'] },
      { fields: ['task_id', 'type'] },
    ],
  },
);
const triggerId = { ...reference('TaskTriggers'), primaryKey: true };
export interface CronTrigger {
  trigger_id: number;
  expression: string;
  timezone: string;
  misfire_policy: 'SKIP' | 'FIRE_ONCE';
  next_fire_at: Date;
  last_fire_at: Date | null;
}
export const CronTriggerModel = sequelize.define<
  Model<CronTrigger, Partial<CronTrigger>> & CronTrigger
>(
  'CronTrigger',
  {
    trigger_id: triggerId,
    expression: text(),
    timezone: text(),
    misfire_policy: text(),
    next_fire_at: { type: DataTypes.DATE, allowNull: false },
    last_fire_at: { type: DataTypes.DATE, allowNull: true },
  },
  { indexes: [{ fields: ['next_fire_at', 'trigger_id'] }] },
);
export interface WebhookTrigger {
  trigger_id: number;
  public_id: string;
  secret_hash: string;
}
export const WebhookTriggerModel = sequelize.define<
  Model<WebhookTrigger, Partial<WebhookTrigger>> & WebhookTrigger
>('WebhookTrigger', {
  trigger_id: triggerId,
  public_id: { ...text(), unique: true },
  secret_hash: text(),
});
export interface GitUpdateTrigger {
  trigger_id: number;
  mode: 'ANY_CHANGE' | 'SOURCE_CHANGE' | 'PATH_FILTER';
  path_filters: string[];
  fire_on_initial: boolean;
}
export const GitUpdateTriggerModel = sequelize.define<
  Model<GitUpdateTrigger, Partial<GitUpdateTrigger>> & GitUpdateTrigger
>('GitUpdateTrigger', {
  trigger_id: triggerId,
  mode: text(),
  path_filters: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  fire_on_initial: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
});
export interface TriggerEvent {
  id: number;
  trigger_id: number | null;
  task_id: number | null;
  event_key: string;
  trigger_type: TriggerType;
  status: TriggerEventStatus;
  task_run_id: number | null;
  error_code: string | null;
  metadata: Record<string, unknown>;
  received_at: Date;
}
export const TriggerEventModel = sequelize.define<
  Model<TriggerEvent, Partial<TriggerEvent>> & TriggerEvent
>(
  'TriggerEvent',
  {
    id,
    trigger_id: reference('TaskTriggers', 'SET NULL', true),
    task_id: reference('Tasks', 'SET NULL', true),
    event_key: text(),
    trigger_type: text(),
    status: { ...text(), defaultValue: 'RECEIVED' },
    task_run_id: { ...reference('TaskRuns', 'SET NULL', true), unique: true },
    error_code: text(true),
    metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    received_at: { type: DataTypes.DATE, allowNull: false },
  },
  {
    indexes: [
      { unique: true, fields: ['trigger_id', 'event_key'] },
      { fields: ['status', 'id'] },
      { fields: ['task_id', 'id'] },
    ],
  },
);
export const triggerModels = [
  TaskTriggerModel,
  CronTriggerModel,
  WebhookTriggerModel,
  GitUpdateTriggerModel,
  TriggerEventModel,
];
