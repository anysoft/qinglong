import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';
export interface DiscoveryPolicy {
  id: number;
  subscription_id: number;
  enabled: boolean;
  includes: string[];
  excludes: string[];
  languages: string[];
  version: number;
  last_reconciled_at: Date | null;
  last_result: Record<string, unknown> | null;
}
export const DiscoveryPolicyModel = sequelize.define<
  Model<DiscoveryPolicy, Partial<DiscoveryPolicy>> & DiscoveryPolicy
>('DiscoveryPolicy', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  subscription_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: { model: 'Subscriptions', key: 'id' },
    onDelete: 'CASCADE',
  },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  includes: { type: DataTypes.JSON, allowNull: false, defaultValue: ['**/*'] },
  excludes: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  languages: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'SHELL'],
  },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  last_reconciled_at: { type: DataTypes.DATE, allowNull: true },
  last_result: { type: DataTypes.JSON, allowNull: true },
});
export const discoveryModels = [DiscoveryPolicyModel];
