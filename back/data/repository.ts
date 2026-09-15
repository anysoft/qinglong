import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';
import { RepositoryIdentity } from '../shared/gitProvider';
export interface Repository extends RepositoryIdentity {
  id?: number;
  name: string;
  default_credential_id?: number | null;
  status?: 'unknown' | 'available' | 'auth_failed' | 'unreachable';
  storage_state?: 'UNINITIALIZED'|'INITIALIZING'|'READY'|'FETCHING'|'ERROR'|'MISSING'|'DELETING';
  storage_path?: string|null;last_fetch_at?:Date|null;last_fetch_status?:string|null;last_error?:string|null;
  default_branch?:string|null;last_known_remote_head?:string|null;remote_refs_count?:number;tags_count?:number;
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
    storage_state:{type:DataTypes.STRING,defaultValue:'UNINITIALIZED',allowNull:false},storage_path:DataTypes.TEXT,
    last_fetch_at:DataTypes.DATE,last_fetch_status:DataTypes.STRING,last_error:DataTypes.TEXT,default_branch:DataTypes.STRING,
    last_known_remote_head:DataTypes.STRING,remote_refs_count:{type:DataTypes.INTEGER,defaultValue:0},tags_count:{type:DataTypes.INTEGER,defaultValue:0},
  },
);
