import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';

export type TaskLanguage = 'PYTHON' | 'JAVASCRIPT' | 'TYPESCRIPT' | 'SHELL';
export type TaskRuntimeKind = 'PYTHON' | 'NODE' | 'SHELL';
export type TaskReadiness =
  | 'READY'
  | 'CONFIGURATION_REQUIRED'
  | 'INVALID'
  | 'SOURCE_MISSING'
  | 'RESOURCE_UNAVAILABLE';
export interface Task {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  origin: 'MANUAL' | 'DISCOVERED';
  subscription_id: number | null;
  discovery_key: string | null;
  discovery_definition: { name: string; schedule: string } | null;
  env_profile_id: number | null;
  arguments: string[];
  version: number;
}
export interface TaskSource {
  task_id: number;
  type: 'WORKTREE_ENTRYPOINT';
  worktree_id: number;
  relative_entrypoint: string;
  language: TaskLanguage;
  cwd_mode: 'WORKTREE_ROOT' | 'ENTRYPOINT_DIR' | 'CUSTOM_RELATIVE';
  cwd_relative_path: string | null;
}
export interface TaskRuntimeBinding {
  task_id: number;
  kind: TaskRuntimeKind;
  python_environment_id: number | null;
  node_environment_id: number | null;
}
export interface TaskExecutionSettings {
  task_id: number;
  timeout_seconds: number | null;
  max_attempts: number;
  initial_delay_seconds: number;
  backoff: 'FIXED' | 'EXPONENTIAL';
  concurrency: 'FORBID' | 'QUEUE' | 'ALLOW';
  notification: 'NONE' | 'FAILURE' | 'SUCCESS' | 'ALWAYS';
}
export interface RuntimeDefault {
  id: number;
  repository_id: number | null;
  subscription_id: number | null;
  kind: 'PYTHON' | 'NODE';
  python_environment_id: number | null;
  node_environment_id: number | null;
  version: number;
}
const text = (nullable = false) => ({
  type: DataTypes.STRING,
  allowNull: nullable,
});
const fk = (model: string, nullable = false, onDelete = 'RESTRICT') => ({
  type: DataTypes.INTEGER,
  allowNull: nullable,
  references: { model, key: 'id' },
  onDelete,
});
const taskKey = () => ({ ...fk('Tasks', false, 'CASCADE'), primaryKey: true });
const version = { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 };
export const TaskModel = sequelize.define<Model<Task, Partial<Task>> & Task>(
  'Task',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: text(),
    description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    origin: { ...text(), defaultValue: 'MANUAL' },
    subscription_id: fk('Subscriptions', true),
    discovery_key: text(true),
    discovery_definition: { type: DataTypes.JSON, allowNull: true },
    env_profile_id: fk('EnvironmentProfiles', true),
    arguments: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    version,
  },
  { indexes: [{ unique: true, fields: ['subscription_id', 'discovery_key'] }] },
);
export const TaskSourceModel = sequelize.define<
  Model<TaskSource, Partial<TaskSource>> & TaskSource
>(
  'TaskSource',
  {
    task_id: taskKey(),
    type: { ...text(), defaultValue: 'WORKTREE_ENTRYPOINT' },
    worktree_id: fk('Worktrees'),
    relative_entrypoint: text(),
    language: text(),
    cwd_mode: { ...text(), defaultValue: 'ENTRYPOINT_DIR' },
    cwd_relative_path: text(true),
  },
  { indexes: [{ fields: ['worktree_id'] }] },
);
export const TaskRuntimeBindingModel = sequelize.define<
  Model<TaskRuntimeBinding, Partial<TaskRuntimeBinding>> & TaskRuntimeBinding
>('TaskRuntimeBinding', {
  task_id: taskKey(),
  kind: text(),
  python_environment_id: fk('PythonEnvironments', true),
  node_environment_id: fk('NodeEnvironments', true),
});
export const TaskExecutionSettingsModel = sequelize.define<
  Model<TaskExecutionSettings, Partial<TaskExecutionSettings>> &
    TaskExecutionSettings
>('TaskExecutionSetting', {
  task_id: taskKey(),
  timeout_seconds: { type: DataTypes.INTEGER, allowNull: true },
  max_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  initial_delay_seconds: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  backoff: { ...text(), defaultValue: 'FIXED' },
  concurrency: { ...text(), defaultValue: 'FORBID' },
  notification: { ...text(), defaultValue: 'NONE' },
});
export const RuntimeDefaultModel = sequelize.define<
  Model<RuntimeDefault, Partial<RuntimeDefault>> & RuntimeDefault
>(
  'RuntimeDefault',
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    repository_id: fk('Repositories', true, 'CASCADE'),
    subscription_id: fk('Subscriptions', true, 'CASCADE'),
    kind: text(),
    python_environment_id: fk('PythonEnvironments', true),
    node_environment_id: fk('NodeEnvironments', true),
    version,
  },
  {
    indexes: [
      { unique: true, fields: ['repository_id', 'kind'] },
      { unique: true, fields: ['subscription_id', 'kind'] },
    ],
  },
);
export const taskModels = [
  TaskModel,
  TaskSourceModel,
  TaskRuntimeBindingModel,
  TaskExecutionSettingsModel,
  RuntimeDefaultModel,
];
