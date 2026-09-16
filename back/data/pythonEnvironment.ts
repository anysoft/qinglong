import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';
export interface DesiredPackage {
  normalized_name: string;
  requirement: string;
}
export interface ResolvedPackage {
  name: string;
  version: string;
  direct: boolean;
  source_index: string;
}
export interface PythonEnvironment {
  id: number;
  name: string;
  description: string;
  runtime_id: number;
  state: string;
  current_revision_id: number | null;
  current_build_id: number | null;
  version: number;
  last_error: string | null;
}
export interface PythonEnvironmentRevision {
  id: number;
  environment_id: number;
  runtime_id: number;
  dependencies: DesiredPackage[];
  spec_hash: string;
}
export interface PythonEnvironmentBuild {
  id: number;
  environment_id: number;
  revision_id: number;
  runtime_id: number;
  state: string;
  health: string;
  resolved: ResolvedPackage[];
  resolved_hash: string | null;
  freeze: string;
  metadata: Record<string, unknown>;
  last_error: string | null;
  verified_at: Date | null;
}
const pk = () => ({
  type: DataTypes.INTEGER,
  primaryKey: true,
  autoIncrement: true,
});
const text = (nullable = false) => ({
  type: DataTypes.STRING,
  allowNull: nullable,
});
const number = (nullable = false) => ({
  type: DataTypes.INTEGER,
  allowNull: nullable,
});
const json = (value: unknown) => ({
  type: DataTypes.JSON,
  allowNull: false,
  defaultValue: value,
});
export const PythonEnvironmentModel = sequelize.define<
  Model<PythonEnvironment, Partial<PythonEnvironment>>
>('PythonEnvironment', {
  id: pk(),
  name: { ...text(), unique: true },
  description: { ...text(), defaultValue: '' },
  runtime_id: number(),
  state: text(),
  current_revision_id: number(true),
  current_build_id: number(true),
  version: { ...number(), defaultValue: 1 },
  last_error: text(true),
});
export const PythonEnvironmentRevisionModel = sequelize.define<
  Model<PythonEnvironmentRevision, Partial<PythonEnvironmentRevision>>
>('PythonEnvironmentRevision', {
  id: pk(),
  environment_id: number(),
  runtime_id: number(),
  dependencies: json([]),
  spec_hash: text(),
});
export const PythonEnvironmentBuildModel = sequelize.define<
  Model<PythonEnvironmentBuild, Partial<PythonEnvironmentBuild>>
>('PythonEnvironmentBuild', {
  id: pk(),
  environment_id: number(),
  revision_id: number(),
  runtime_id: number(),
  state: text(),
  health: { ...text(), defaultValue: 'UNVERIFIED' },
  resolved: json([]),
  resolved_hash: text(true),
  freeze: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  metadata: json({}),
  last_error: text(true),
  verified_at: { type: DataTypes.DATE, allowNull: true },
});
export const pythonEnvironmentModels = [
  PythonEnvironmentModel,
  PythonEnvironmentRevisionModel,
  PythonEnvironmentBuildModel,
];
export {
  pythonEnvironmentOperationTypes,
  PythonEnvironmentOperationType,
} from '../shared/pythonEnvironment';
