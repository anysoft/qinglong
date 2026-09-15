import { DataTypes, Model } from 'sequelize';
import { sequelize } from '.';
export interface Worktree {
  id?: number;
  repository_id: number;
  name: string;
  ref_type: 'branch' | 'tag' | 'commit';
  ref_name: string;
  branch?: string | null;
  branch_key?: string | null;
  commit?: string | null;
  target_commit?: string | null;
  local_path?: string | null;
  lifecycle_state?:
    | 'CREATING'
    | 'READY'
    | 'ERROR'
    | 'MISSING'
    | 'STALE'
    | 'DELETING';
  dirty_state?: 'UNKNOWN' | 'CLEAN' | 'DIRTY' | 'CONFLICT';
  managed?: boolean;
  purpose?: 'USER' | 'SUBSCRIPTION';
  status_snapshot?: any;
  last_update_at?: Date | null;
  last_error?: string | null;
}
export interface WorktreeInstance extends Model<Worktree, Worktree>, Worktree {}
export const WorktreeModel = sequelize.define<WorktreeInstance>('Worktree', {
  repository_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Repositories', key: 'id' },
    onDelete: 'RESTRICT',
  },
  name: { type: DataTypes.STRING, allowNull: false },
  ref_type: { type: DataTypes.STRING, allowNull: false },
  ref_name: { type: DataTypes.STRING, allowNull: false },
  branch: DataTypes.STRING,
  branch_key: { type: DataTypes.STRING, unique: true },
  commit: DataTypes.STRING,
  target_commit: DataTypes.STRING,
  local_path: DataTypes.TEXT,
  lifecycle_state: { type: DataTypes.STRING, defaultValue: 'CREATING' },
  dirty_state: { type: DataTypes.STRING, defaultValue: 'UNKNOWN' },
  purpose: { type: DataTypes.STRING, allowNull: false, defaultValue: 'USER' },
  managed: { type: DataTypes.BOOLEAN, defaultValue: true },
  status_snapshot: DataTypes.JSON,
  last_update_at: DataTypes.DATE,
  last_error: DataTypes.TEXT,
});
