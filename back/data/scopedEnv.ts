import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';

export interface EnvironmentProfile {
  id?: number;
  repository_id: number;
  name: string;
  description?: string;
  status?: 'enabled' | 'disabled';
}
export interface ScopedVariable {
  id?: number;
  profile_id?: number;
  cron_id?: number;
  name: string;
  value?: string | null;
  status?: 'enabled' | 'disabled';
  operation?: 'SET' | 'UNSET';
  is_secret?: boolean;
  position?: number;
  labels?: string[];
}
export const EnvironmentProfileModel = sequelize.define<Model<EnvironmentProfile> & EnvironmentProfile>('EnvironmentProfile', {
  repository_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Repositories', key: 'id' }, onDelete: 'RESTRICT', unique: 'repository_profile_name' },
  name: { type: DataTypes.STRING, allowNull: false, unique: 'repository_profile_name' },
  description: { type: DataTypes.TEXT, defaultValue: '' },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'enabled' },
});
const variableFields = {
  name: { type: DataTypes.STRING, allowNull: false },
  value: DataTypes.TEXT,
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'enabled' },
  operation: { type: DataTypes.STRING, allowNull: false, defaultValue: 'SET' },
  is_secret: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  position: { type: DataTypes.FLOAT, defaultValue: 0 },
  labels: { type: DataTypes.JSON, defaultValue: [] },
};
// Values are private by default, including plain variables. Services explicitly project public DTOs.
export const RepositoryEnvVariableModel = sequelize.define<Model<ScopedVariable> & ScopedVariable>('RepositoryEnvVariable', {
  ...variableFields,
  profile_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'EnvironmentProfiles', key: 'id' }, onDelete: 'CASCADE' },
}, { defaultScope: { attributes: { exclude: ['value'] } }, indexes: [{ unique: true, fields: ['profile_id', 'name'] }] });
export const TaskEnvVariableModel = sequelize.define<Model<ScopedVariable> & ScopedVariable>('TaskEnvVariable', {
  ...variableFields,
  cron_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Crontabs', key: 'id' }, onDelete: 'CASCADE' },
}, { defaultScope: { attributes: { exclude: ['value'] } }, indexes: [{ unique: true, fields: ['cron_id', 'name'] }] });
