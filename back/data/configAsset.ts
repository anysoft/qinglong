import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';

export type TargetBase = 'WORKSPACE_ROOT' | 'TASK_DIR';
export type HookPhase =
  | 'BEFORE'
  | 'AFTER_SUCCESS'
  | 'AFTER_FAILURE'
  | 'FINALLY';
export type FailurePolicy = 'FAIL_EXECUTION' | 'CONTINUE';
export interface ConfigAsset {
  id: number;
  name: string;
  description: string;
  content_type: 'TEXT' | 'BINARY';
  is_secret: boolean;
  current_revision_id: number | null;
  version: number;
}
export interface ConfigRevision {
  id: number;
  asset_id: number;
  revision_number: number;
  checksum: string;
  size: number;
  storage_key: string;
}
export interface ConfigBinding {
  id: number;
  repository_id?: number;
  task_id?: number;
  asset_id: number | null;
  operation: 'ATTACH' | 'MASK';
  target_base: TargetBase;
  target_path: string;
  materialization_mode: 'COPY' | 'SYMLINK';
  conflict_policy: 'FAIL_IF_EXISTS' | 'REPLACE_RESTORE';
  writable: boolean;
  enabled: boolean;
  version: number;
}
export interface TaskHook {
  id: number;
  task_id: number;
  name: string;
  phase: HookPhase;
  command: string;
  cwd_base: 'TASK_CWD' | 'WORKSPACE_ROOT';
  position: number;
  timeout_seconds: number;
  failure_policy: FailurePolicy;
  enabled: boolean;
  version: number;
}
const fk = (model: string, nullable = false, onDelete = 'RESTRICT') => ({
  type: DataTypes.INTEGER,
  allowNull: nullable,
  references: { model, key: 'id' },
  onDelete,
});
const id = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };
const version = { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 };
export const ConfigAssetModel = sequelize.define<
  Model<ConfigAsset, Partial<ConfigAsset>>
>('ConfigAsset', {
  id,
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  content_type: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'TEXT',
  },
  is_secret: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  current_revision_id: fk('ConfigAssetRevisions', true),
  version,
});
export const ConfigAssetRevisionModel = sequelize.define<
  Model<ConfigRevision, Partial<ConfigRevision>>
>(
  'ConfigAssetRevision',
  {
    id,
    asset_id: fk('ConfigAssets'),
    revision_number: { type: DataTypes.INTEGER, allowNull: false },
    checksum: { type: DataTypes.STRING, allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    storage_key: { type: DataTypes.STRING, allowNull: false, unique: true },
  },
  {
    updatedAt: false,
    indexes: [{ unique: true, fields: ['asset_id', 'revision_number'] }],
  },
);
const bindingAttributes = () => ({
  asset_id: fk('ConfigAssets', true),
  operation: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'ATTACH',
  },
  target_base: { type: DataTypes.STRING, allowNull: false },
  target_path: { type: DataTypes.STRING, allowNull: false },
  materialization_mode: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'COPY',
  },
  conflict_policy: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'FAIL_IF_EXISTS',
  },
  writable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  version,
});
export const RepositoryConfigBindingModel = sequelize.define<
  Model<ConfigBinding, Partial<ConfigBinding>>
>(
  'RepositoryConfigBinding',
  { id, repository_id: fk('Repositories'), ...bindingAttributes() },
  {
    indexes: [
      { unique: true, fields: ['repository_id', 'target_base', 'target_path'] },
    ],
  },
);
export const TaskConfigBindingModel = sequelize.define<
  Model<ConfigBinding, Partial<ConfigBinding>>
>(
  'TaskConfigBinding',
  { id, task_id: fk('Tasks', false, 'CASCADE'), ...bindingAttributes() },
  {
    indexes: [
      { unique: true, fields: ['task_id', 'target_base', 'target_path'] },
    ],
  },
);
export const TaskHookModel = sequelize.define<
  Model<TaskHook, Partial<TaskHook>>
>(
  'TaskHook',
  {
    id,
    task_id: fk('Tasks', false, 'CASCADE'),
    name: { type: DataTypes.STRING, allowNull: false },
    phase: { type: DataTypes.STRING, allowNull: false },
    command: { type: DataTypes.TEXT, allowNull: false },
    cwd_base: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'TASK_CWD',
    },
    position: { type: DataTypes.INTEGER, allowNull: false },
    timeout_seconds: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 60,
    },
    failure_policy: { type: DataTypes.STRING, allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    version,
  },
  { indexes: [{ unique: true, fields: ['task_id', 'phase', 'position'] }] },
);
export const configAssetModels = [
  ConfigAssetModel,
  ConfigAssetRevisionModel,
  RepositoryConfigBindingModel,
  TaskConfigBindingModel,
  TaskHookModel,
];
