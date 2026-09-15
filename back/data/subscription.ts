import { sequelize } from '.';
import { DataTypes, Model, ModelDefined } from 'sequelize';
import { SimpleIntervalSchedule } from 'toad-scheduler';

type SimpleIntervalScheduleUnit = keyof SimpleIntervalSchedule;
export class Subscription {
  id?: number;
  repository_id?: number | null;
  env_profile_id?: number | null;
  credential_id?: number | null;
  git_mode?: 'LEGACY' | 'MANAGED';
  worktree_id?: number | null;
  last_synced_commit?: string | null;
  last_sync_at?: Date | null;
  last_sync_state?: 'RUNNING' | 'SUCCESS' | 'FAILED' | null;
  last_sync_phase?: string | null;
  last_sync_error?: string | null;
  name?: string;
  type?: 'public-repo' | 'private-repo' | 'file';
  schedule_type?: 'crontab' | 'interval';
  schedule?: string;
  interval_schedule?: { type: SimpleIntervalScheduleUnit; value: number };
  url?: string;
  whitelist?: string;
  blacklist?: string;
  dependences?: string;
  branch?: string;
  status?: SubscriptionStatus;
  pull_type?: 'ssh-key' | 'user-pwd';
  pull_option?:
    | { private_key: string }
    | { username: string; password: string };
  pid?: number;
  is_disabled?: 1 | 0;
  log_path?: string;
  alias: string;
  command?: string;
  extensions?: string;
  sub_before?: string;
  sub_after?: string;
  proxy?: string;
  autoAddCron?: 1 | 0;
  autoDelCron?: 1 | 0;

  constructor(options: Subscription) {
    this.id = options.id;
    this.repository_id = options.repository_id;
    this.env_profile_id = options.env_profile_id;
    this.credential_id = options.credential_id;
    this.git_mode = options.git_mode || 'LEGACY';
    this.worktree_id = options.worktree_id;
    this.last_synced_commit = options.last_synced_commit;
    this.last_sync_at = options.last_sync_at;
    this.last_sync_state = options.last_sync_state;
    this.last_sync_phase = options.last_sync_phase;
    this.last_sync_error = options.last_sync_error;
    this.name = options.name || options.alias;
    this.type = options.type;
    this.schedule = options.schedule;
    this.status = this.status =
      typeof options.status === 'number' && SubscriptionStatus[options.status]
        ? options.status
        : SubscriptionStatus.idle;
    this.url = options.url;
    this.whitelist = options.whitelist;
    this.blacklist = options.blacklist;
    this.dependences = options.dependences;
    this.branch = options.branch;
    this.pull_type = options.pull_type;
    this.pull_option = options.pull_option;
    this.pid = options.pid;
    this.is_disabled = options.is_disabled;
    this.log_path = options.log_path;
    this.schedule_type = options.schedule_type;
    this.alias = options.alias;
    this.interval_schedule = options.interval_schedule;
    this.extensions = options.extensions;
    this.sub_before = options.sub_before;
    this.sub_after = options.sub_after;
    this.proxy = options.proxy;
    this.autoAddCron = options.autoAddCron ? 1 : 0;
    this.autoDelCron = options.autoDelCron ? 1 : 0;
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
      allowNull: true,
      references: { model: 'Repositories', key: 'id' },
      onDelete: 'RESTRICT',
    },
    credential_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'GitCredentials', key: 'id' },
      onDelete: 'RESTRICT',
    },
    git_mode: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'LEGACY',
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
      unique: 'compositeIndex',
      type: DataTypes.STRING,
    },
    url: {
      unique: 'compositeIndex',
      type: DataTypes.STRING,
    },
    schedule: {
      unique: 'compositeIndex',
      type: DataTypes.STRING,
    },
    interval_schedule: {
      unique: 'compositeIndex',
      type: DataTypes.JSON,
    },
    type: DataTypes.STRING,
    whitelist: DataTypes.STRING,
    blacklist: DataTypes.STRING,
    status: DataTypes.NUMBER,
    dependences: DataTypes.STRING,
    extensions: DataTypes.STRING,
    sub_before: DataTypes.STRING,
    sub_after: DataTypes.STRING,
    branch: DataTypes.STRING,
    pull_type: DataTypes.STRING,
    pull_option: DataTypes.JSON,
    pid: DataTypes.NUMBER,
    is_disabled: DataTypes.NUMBER,
    log_path: DataTypes.STRING,
    schedule_type: DataTypes.STRING,
    alias: { type: DataTypes.STRING, unique: 'alias' },
    proxy: { type: DataTypes.STRING, allowNull: true },
    autoAddCron: { type: DataTypes.NUMBER, allowNull: true },
    autoDelCron: { type: DataTypes.NUMBER, allowNull: true },
  },
);
