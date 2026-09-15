import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';
import { RepositoryIdentity } from '../shared/gitProvider';
export interface Repository extends RepositoryIdentity {
  id?: number;
  name: string;
  default_credential_id?: number | null;
  status?: 'unknown' | 'available' | 'auth_failed' | 'unreachable';
}
export interface RepositoryInstance
  extends Model<Repository, Repository>,
    Repository {}
export const RepositoryModel = sequelize.define<RepositoryInstance>(
  'Repository',
  {
    name: { type: DataTypes.STRING, allowNull: false },
    provider: { type: DataTypes.STRING, allowNull: false },
    remote_url: { type: DataTypes.TEXT, allowNull: false },
    normalized_url: { type: DataTypes.STRING, allowNull: false, unique: true },
    host: DataTypes.STRING,
    path: DataTypes.TEXT,
    owner: DataTypes.STRING,
    repository_name: DataTypes.STRING,
    default_credential_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: 'GitCredentials', key: 'id' },
      onDelete: 'RESTRICT',
    },
    status: { type: DataTypes.STRING, defaultValue: 'unknown' },
  },
);
