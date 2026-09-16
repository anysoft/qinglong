import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';

export const taskRunStatuses = [
  'QUEUED',
  'RESOLVING',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
  'INTERRUPTED',
  'SKIPPED',
  'RECOVERY_REQUIRED',
] as const;
export type TaskRunStatus = (typeof taskRunStatuses)[number];
export type TaskRunTrigger = 'MANUAL' | 'SCHEDULE' | 'API' | 'INTERNAL' | 'CRON' | 'WEBHOOK' | 'GIT_UPDATE';
export interface TaskRun {
  id: number;
  task_id: number | null;
  worktree_id: number | null;
  result: Record<string, unknown> | null;
  task_definition_version: number | null;
  trigger_type: TaskRunTrigger;
  trigger_id: number | null;
  event_id: number | null;
  submission_key: string | null;
  status: TaskRunStatus;
  submitted_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
  attempt_count: number;
  cancel_requested: boolean;
  log_identity: string;
  result_code: string | null;
  exit_code: number | null;
  signal: string | null;
  error_code: string | null;
  error_summary: string | null;
  snapshot_metadata: Record<string, unknown> | null;
  concurrency_policy: 'FORBID' | 'QUEUE' | 'ALLOW';
  owner_token: string | null;
}
export interface TaskRunAttempt {
  id: number;
  task_run_id: number;
  attempt_number: number;
  status: TaskRunStatus;
  started_at: Date;
  finished_at: Date | null;
  exit_code: number | null;
  signal: string | null;
  error_code: string | null;
  error_summary: string | null;
  duration_ms: number | null;
}
const text = (allowNull = true) => ({ type: DataTypes.STRING, allowNull });
const integer = (allowNull = true) => ({ type: DataTypes.INTEGER, allowNull });
const date = (allowNull = true) => ({ type: DataTypes.DATE, allowNull });
const outcome = () => ({
  exit_code: integer(),
  signal: text(),
  error_code: text(),
  error_summary: text(),
});
export const TaskRunModel = sequelize.define<
  Model<TaskRun, Partial<TaskRun>> & TaskRun
>(
  'TaskRun',
  {
    id: { ...integer(false), primaryKey: true, autoIncrement: true },
    task_id: {
      ...integer(),
      references: { model: 'Tasks', key: 'id' },
      onDelete: 'SET NULL',
    },
    worktree_id: {
      ...integer(),
      references: { model: 'Worktrees', key: 'id' },
      onDelete: 'RESTRICT',
    },
    result: { type: DataTypes.JSON, allowNull: true },
    task_definition_version: integer(),
    trigger_type: text(false),
    trigger_id: { ...integer(), references: { model: 'TaskTriggers', key: 'id' }, onDelete: 'SET NULL' },
    event_id: { ...integer(), references: { model: 'TriggerEvents', key: 'id' }, onDelete: 'SET NULL' },
    submission_key: text(),
    status: { ...text(false), defaultValue: 'QUEUED' },
    submitted_at: date(false),
    started_at: date(),
    finished_at: date(),
    attempt_count: { ...integer(false), defaultValue: 0 },
    cancel_requested: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    log_identity: { ...text(false), unique: true },
    result_code: text(),
    ...outcome(),
    snapshot_metadata: { type: DataTypes.JSON, allowNull: true },
    concurrency_policy: text(false),
    owner_token: text(),
  },
  {
    indexes: [
      { unique: true, fields: ['submission_key'] },
      { fields: ['status', 'id'] },
      { fields: ['task_id', 'status', 'id'] },
    ],
  },
);
export const TaskRunAttemptModel = sequelize.define<
  Model<TaskRunAttempt, Partial<TaskRunAttempt>> & TaskRunAttempt
>(
  'TaskRunAttempt',
  {
    id: { ...integer(false), primaryKey: true, autoIncrement: true },
    task_run_id: {
      ...integer(false),
      references: { model: 'TaskRuns', key: 'id' },
      onDelete: 'CASCADE',
    },
    attempt_number: integer(false),
    status: text(false),
    started_at: date(false),
    finished_at: date(),
    ...outcome(),
    duration_ms: integer(),
  },
  { indexes: [{ unique: true, fields: ['task_run_id', 'attempt_number'] }] },
);
export const taskRunModels = [TaskRunModel, TaskRunAttemptModel];
