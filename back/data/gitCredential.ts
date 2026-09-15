import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';
import { GitProvider } from '../shared/gitProvider';
export interface GitCredential {
  id?: number;
  name: string;
  provider: GitProvider;
  auth_type: 'anonymous' | 'https_token' | 'ssh_key';
  username?: string;
  public_key?: string;
  known_hosts?: string;
  capability: 'READ' | 'WRITE';
  status: 'enabled' | 'disabled';
  last_test_at?: Date;
  last_test_result?: string;
}
export interface GitCredentialInstance
  extends Model<GitCredential, GitCredential>,
    GitCredential {}
// Secrets have no property in the public DTO and are excluded from all default reads.
export const GitCredentialModel = sequelize.define<GitCredentialInstance>(
  'GitCredential',
  {
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    provider: { type: DataTypes.STRING, allowNull: false },
    auth_type: { type: DataTypes.STRING, allowNull: false },
    username: DataTypes.STRING,
    secret: { type: DataTypes.TEXT } as any,
    public_key: DataTypes.TEXT,
    known_hosts: DataTypes.TEXT,
    capability: {
      type: DataTypes.STRING,
      defaultValue: 'READ',
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: 'enabled',
      allowNull: false,
    },
    last_test_at: DataTypes.DATE,
    last_test_result: DataTypes.STRING,
  } as any,
  { defaultScope: { attributes: { exclude: ['secret'] } } },
);
