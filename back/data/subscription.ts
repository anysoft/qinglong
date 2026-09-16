import { sequelize } from '.';
import { DataTypes, Model, ModelDefined } from 'sequelize';
import { SimpleIntervalSchedule } from 'toad-scheduler';

type SimpleIntervalScheduleUnit = keyof SimpleIntervalSchedule;
export class Subscription {
  id?: number;
  repository_id: number;
  env_profile_id?: number | null;
  worktree_id?: number | null;
  last_synced_commit?: string | null;
  last_sync_at?: Date | null;
  last_sync_state?: 'RUNNING' | 'SUCCESS' | 'FAILED' | null;
  last_sync_phase?: string | null;
  last_sync_error?: string | null;
  name?: string;
  schedule_type?: 'crontab' | 'interval';
  schedule?: string;
  interval_schedule?: { type: SimpleIntervalScheduleUnit; value: number };
  branch?: string;
  status?: SubscriptionStatus;
  pid?: number;
  is_disabled?: 1 | 0;
  log_path?: string;

  constructor(options: Subscription) {
    this.id = options.id;
    this.repository_id = options.repository_id;
    this.env_profile_id = options.env_profile_id;
    this.worktree_id = options.worktree_id;
    this.last_synced_commit = options.last_synced_commit;
    this.last_sync_at = options.last_sync_at;
    this.last_sync_state = options.last_sync_state;
    this.last_sync_phase = options.last_sync_phase;
    this.last_sync_error = options.last_sync_error;
    this.name = options.name;
    this.schedule = options.schedule;
    this.status = this.status =
      typeof options.status === 'number' && SubscriptionStatus[options.status]
        ? options.status
        : SubscriptionStatus.idle;
    this.branch = options.branch;
    this.pid = options.pid;
    this.is_disabled = options.is_disabled;
    this.log_path = options.log_path;
    this.schedule_type = options.schedule_type;
    this.interval_schedule = options.interval_schedule;
  }
}

export enum SubscriptionStatus {
  'running',
  'idle',
  'disabled',
  'queued',
}

export interface SubscriptionInstance
  extends Model<Subscription, Subscription>,
    Subscription {}
export const SubscriptionModel = sequelize.define<SubscriptionInstance>(
  'Subscription',
  {
    env_profile_id: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'EnvironmentProfiles', key: 'id' }, onDelete: 'RESTRICT' },
    repository_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: 'Repositories', key: 'id' },
      onDelete: 'RESTRICT',
    },
    worktree_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'Worktrees', key: 'id' },
      onDelete: 'RESTRICT',
    },
    last_synced_commit: DataTypes.STRING,
    last_sync_at: DataTypes.DATE,
    last_sync_state: DataTypes.STRING,
    last_sync_phase: DataTypes.STRING,
    last_sync_error: DataTypes.TEXT,
    name: {
      type: DataTypes.STRING,
    },
    schedule: {
      type: DataTypes.STRING,
    },
    interval_schedule: {
      type: DataTypes.JSON,
    },
    status: DataTypes.NUMBER,
    branch: DataTypes.STRING,
    pid: DataTypes.NUMBER,
    is_disabled: DataTypes.NUMBER,
    log_path: DataTypes.STRING,
    schedule_type: DataTypes.STRING,
  },
);
