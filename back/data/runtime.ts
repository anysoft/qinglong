import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';

export type ProviderState =
  | 'UNINITIALIZED'
  | 'INSTALLING'
  | 'READY'
  | 'UPDATING'
  | 'ERROR'
  | 'MISSING';
export type RuntimeState =
  | 'INSTALLING'
  | 'READY'
  | 'VERIFYING'
  | 'ERROR'
  | 'REMOVING'
  | 'MISSING'
  | 'REMOVED';
export type OperationType =
  | 'PROVIDER_INSTALL'
  | 'PROVIDER_UPDATE'
  | 'PROVIDER_VERIFY'
  | 'PROVIDER_REPAIR'
  | 'CATALOG_REFRESH'
  | 'RUNTIME_INSTALL'
  | 'RUNTIME_VERIFY'
  | 'RUNTIME_REMOVE'
  | 'RUNTIME_REPAIR';
export type OperationStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED';
export interface RuntimeProvider {
  id: number;
  language: 'PYTHON';
  provider_type: 'PYENV';
  state: ProviderState;
  provider_version: string | null;
  provider_revision: string | null;
  install_root: string;
  catalog: string[];
  last_refresh_at: Date | null;
  last_verified_at: Date | null;
  last_error: string | null;
  version: number;
}
export interface RuntimeInstallation {
  id: number;
  provider_id: number;
  language: 'PYTHON';
  implementation: 'CPYTHON';
  version: string;
  state: RuntimeState;
  executable_relative_path: string;
  installed_at: Date | null;
  verified_at: Date | null;
  metadata: Record<string, unknown>;
  last_error: string | null;
}
export interface RuntimeOperation {
  id: number;
  provider_id: number;
  runtime_id: number | null;
  operation_type: OperationType;
  status: OperationStatus;
  stage: string;
  owner_token: string;
  owner_pid: number;
  cancel_requested: boolean;
  started_at: Date | null;
  finished_at: Date | null;
  exit_code: number | null;
  log_identity: string;
  error_code: string | null;
  error_summary: string | null;
  metadata: Record<string, unknown>;
}
const id = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };
const text = (nullable = false) => ({
  type: DataTypes.STRING,
  allowNull: nullable,
});
const date = () => ({ type: DataTypes.DATE, allowNull: true });
const fk = (model: string, nullable = false) => ({
  type: DataTypes.INTEGER,
  allowNull: nullable,
  references: { model, key: 'id' },
  onDelete: 'RESTRICT',
});
export const RuntimeProviderModel = sequelize.define<
  Model<RuntimeProvider, Partial<RuntimeProvider>>
>(
  'RuntimeProvider',
  {
    id,
    language: text(),
    provider_type: text(),
    state: text(),
    provider_version: text(true),
    provider_revision: text(true),
    install_root: text(),
    catalog: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    last_refresh_at: date(),
    last_verified_at: date(),
    last_error: text(true),
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  { indexes: [{ unique: true, fields: ['language', 'provider_type'] }] },
);
export const RuntimeInstallationModel = sequelize.define<
  Model<RuntimeInstallation, Partial<RuntimeInstallation>>
>(
  'RuntimeInstallation',
  {
    id,
    provider_id: fk('RuntimeProviders'),
    language: text(),
    implementation: text(),
    version: text(),
    state: text(),
    executable_relative_path: text(),
    installed_at: date(),
    verified_at: date(),
    metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    last_error: text(true),
  },
  {
    indexes: [
      { unique: true, fields: ['provider_id', 'implementation', 'version'] },
    ],
  },
);
export const RuntimeOperationModel = sequelize.define<
  Model<RuntimeOperation, Partial<RuntimeOperation>>
>(
  'RuntimeOperation',
  {
    id,
    provider_id: fk('RuntimeProviders'),
    runtime_id: fk('RuntimeInstallations', true),
    operation_type: text(),
    status: text(),
    stage: text(),
    owner_token: text(),
    owner_pid: { type: DataTypes.INTEGER, allowNull: false },
    cancel_requested: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    started_at: date(),
    finished_at: date(),
    exit_code: { type: DataTypes.INTEGER, allowNull: true },
    log_identity: { ...text(), unique: true },
    error_code: text(true),
    error_summary: text(true),
    metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  },
  { indexes: [{ fields: ['provider_id', 'status'] }] },
);
export const runtimeModels = [
  RuntimeProviderModel,
  RuntimeInstallationModel,
  RuntimeOperationModel,
];
