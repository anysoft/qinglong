import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';

export class Env {
  value?: string;
  operation?: 'SET' | 'UNSET';
  is_secret?: boolean;
  replace_secret?: boolean;
  timestamp?: string;
  id?: number;
  status?: EnvStatus;
  position?: number;
  name?: string;
  remarks?: string;
  isPinned?: 1 | 0;
  labels?: string[];

  constructor(options: Env) {
    this.value = options.value;
    this.operation = options.operation ?? 'SET';
    this.is_secret = options.is_secret ?? false;
    this.id = options.id;
    this.status =
      typeof options.status === 'number' && EnvStatus[options.status]
        ? options.status
        : EnvStatus.normal;
    this.timestamp = new Date().toString();
    this.position = options.position;
    this.name = options.name;
    this.remarks = options.remarks || '';
    this.isPinned = options.isPinned || 0;
    this.labels = options.labels || [];
  }
}

export enum EnvStatus {
  'normal',
  'disabled',
}

export const maxPosition = 9000000000000000;
export const initPosition = 4500000000000000;
export const stepPosition = 10000000000;
export const minPosition = 100;

export interface EnvInstance extends Model<Env, Env>, Env {}
export const EnvModel = sequelize.define<EnvInstance>('Env', {
  value: DataTypes.TEXT,
  operation: { type: DataTypes.STRING, allowNull: false, defaultValue: 'SET' },
  is_secret: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  timestamp: DataTypes.STRING,
  status: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  position: DataTypes.NUMBER,
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  remarks: DataTypes.STRING,
  isPinned: DataTypes.NUMBER,
  labels: DataTypes.JSON,
}, { defaultScope: { attributes: { exclude: ['value'] } } });
