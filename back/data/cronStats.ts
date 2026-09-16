import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';

export class TaskStat {
  id?: number;
  ref_id!: number;
  date!: string;
  run_count?: number;
  success_count?: number;
  fail_count?: number;
  total_time?: number;
  max_time?: number;

  constructor(options: TaskStat) {
    this.id = options.id;
    this.ref_id = options.ref_id;
    this.date = options.date;
    this.run_count = options.run_count || 0;
    this.success_count = options.success_count || 0;
    this.fail_count = options.fail_count || 0;
    this.total_time = options.total_time || 0;
    this.max_time = options.max_time || 0;
  }
}

export interface TaskStatInstance extends Model<TaskStat, TaskStat>, TaskStat {}

export const TaskStatModel = sequelize.define<TaskStatInstance>(
  'TaskStat',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ref_id: {
      type: DataTypes.NUMBER,
      allowNull: false,
    },
    date: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    run_count: {
      type: DataTypes.NUMBER,
      defaultValue: 0,
    },
    success_count: {
      type: DataTypes.NUMBER,
      defaultValue: 0,
    },
    fail_count: {
      type: DataTypes.NUMBER,
      defaultValue: 0,
    },
    total_time: {
      type: DataTypes.NUMBER,
      defaultValue: 0,
    },
    max_time: {
      type: DataTypes.NUMBER,
      defaultValue: 0,
    },
  },
  {
    tableName: 'TaskStats',
    indexes: [
      { unique: true, fields: ['ref_id', 'date'] },
      { fields: ['date'] },
    ],
  },
);
