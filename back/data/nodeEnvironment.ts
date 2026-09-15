import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';
import {
  NodeDependency,
  NodeManagerType,
  NodePolicies,
  NodeResolvedPackage,
} from '../shared/nodeEnvironment';
export interface NodePackageManagerToolchain {
  id: number;
  runtime_id: number;
  manager_type: NodeManagerType;
  version: string;
  state: string;
  metadata: Record<string, unknown>;
  verified_at: Date | null;
  last_error: string | null;
}
export interface NodeEnvironment extends NodePolicies {
  id: number;
  name: string;
  description: string;
  runtime_id: number;
  toolchain_id: number;
  state: string;
  current_revision_id: number | null;
  current_build_id: number | null;
  version: number;
  last_error: string | null;
}
export interface NodeEnvironmentRevision extends NodePolicies {
  id: number;
  environment_id: number;
  runtime_id: number;
  toolchain_id: number;
  dependencies: NodeDependency[];
  spec_hash: string;
}
export interface NodeEnvironmentBuild {
  id: number;
  environment_id: number;
  revision_id: number;
  runtime_id: number;
  toolchain_id: number;
  state: string;
  health: string;
  package_json: string;
  lockfile: string;
  lock_hash: string | null;
  resolved: NodeResolvedPackage[];
  resolved_hash: string | null;
  metadata: Record<string, unknown>;
  verified_at: Date | null;
  last_error: string | null;
}
const id = () => ({
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true,
});
const text = (nullable = false) => ({
  type: DataTypes.STRING,
  allowNull: nullable,
});
const date = () => ({ type: DataTypes.DATE, allowNull: true });
const json = (value: unknown) => ({
  type: DataTypes.JSON,
  allowNull: false,
  defaultValue: value,
});
const fk = (model: string) => ({
  type: DataTypes.INTEGER,
  allowNull: false,
  references: { model, key: 'id' },
  onDelete: 'RESTRICT',
});
const policies = () => ({
  production_only: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  install_scripts_policy: { ...text(), defaultValue: 'ALLOW' },
});
export const NodePackageManagerToolchainModel = sequelize.define<
  Model<NodePackageManagerToolchain, Partial<NodePackageManagerToolchain>>
>(
  'NodePackageManagerToolchain',
  {
    id: id(),
    runtime_id: fk('RuntimeInstallations'),
    manager_type: text(),
    version: text(),
    state: text(),
    metadata: json({}),
    verified_at: date(),
    last_error: text(true),
  },
  {
    indexes: [
      { unique: true, fields: ['runtime_id', 'manager_type', 'version'] },
    ],
  },
);
export const NodeEnvironmentModel = sequelize.define<
  Model<NodeEnvironment, Partial<NodeEnvironment>>
>('NodeEnvironment', {
  id: id(),
  name: { ...text(), unique: true },
  description: { ...text(), defaultValue: '' },
  runtime_id: fk('RuntimeInstallations'),
  toolchain_id: fk('NodePackageManagerToolchains'),
  state: text(),
  current_revision_id: { type: DataTypes.INTEGER, allowNull: true },
  current_build_id: { type: DataTypes.INTEGER, allowNull: true },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  last_error: text(true),
  ...policies(),
});
export const NodeEnvironmentRevisionModel = sequelize.define<
  Model<NodeEnvironmentRevision, Partial<NodeEnvironmentRevision>>
>('NodeEnvironmentRevision', {
  id: id(),
  environment_id: fk('NodeEnvironments'),
  runtime_id: fk('RuntimeInstallations'),
  toolchain_id: fk('NodePackageManagerToolchains'),
  dependencies: json([]),
  spec_hash: text(),
  ...policies(),
});
export const NodeEnvironmentBuildModel = sequelize.define<
  Model<NodeEnvironmentBuild, Partial<NodeEnvironmentBuild>>
>('NodeEnvironmentBuild', {
  id: id(),
  environment_id: fk('NodeEnvironments'),
  revision_id: fk('NodeEnvironmentRevisions'),
  runtime_id: fk('RuntimeInstallations'),
  toolchain_id: fk('NodePackageManagerToolchains'),
  state: text(),
  health: { ...text(), defaultValue: 'UNVERIFIED' },
  package_json: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  lockfile: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  lock_hash: text(true),
  resolved: json([]),
  resolved_hash: text(true),
  metadata: json({}),
  verified_at: date(),
  last_error: text(true),
});
export const nodeEnvironmentModels = [
  NodePackageManagerToolchainModel,
  NodeEnvironmentModel,
  NodeEnvironmentRevisionModel,
  NodeEnvironmentBuildModel,
];
