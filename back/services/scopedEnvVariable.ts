import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { EnvModel } from '../data/env';
import { TaskModel } from '../data/task';
import { taskRepository } from './taskRelationships';
import { SubscriptionModel } from '../data/subscription';
import { ScopedVariable, RepositoryEnvVariableModel, TaskEnvVariableModel } from '../data/scopedEnv';
import RepositoryEnvProfileService from './repositoryEnvProfile';
import { ScopedEnvironmentError, validateEnvironmentName, validateEnvironmentValue } from '../shared/scopedEnv';
import Logger from '../loaders/logger';

export type VariablePatch = Partial<ScopedVariable> & { name: string; clear?: boolean; replace_secret?: boolean };
export function publicVariable(row: ScopedVariable) {
  const { value, ...metadata } = row;
  return { ...metadata, has_value: value != null, value: row.is_secret ? null : value, display: row.is_secret && value != null ? '********' : value };
}
@Service()
export default class ScopedEnvVariableService {
  constructor(private profiles: RepositoryEnvProfileService) {}
  private async owner(scope: 'global' | 'repository' | 'task', id: number, transaction?: Transaction) {
    if (scope === 'global') return null;
    if (scope === 'repository') return this.profiles.get(id, transaction);
    const task = await TaskModel.findByPk(id, { transaction });
    if (!task) throw new ScopedEnvironmentError('ENV_TASK_NOT_FOUND', 404);
    return task;
  }
  async list(scope: 'global' | 'repository' | 'task', id: number) {
    await this.owner(scope, id);
    const model: any = scope === 'global' ? EnvModel : scope === 'repository' ? RepositoryEnvVariableModel : TaskEnvVariableModel;
    const rows = await model.unscoped().findAll({ where: scope === 'global' ? {} : { [scope === 'repository' ? 'profile_id' : 'task_id']: id }, order: [['position', 'DESC'], ['name', 'ASC']] });
    return rows.map((x: any) => { const row = x.get({ plain: true }); return publicVariable({ ...row, status: scope === 'global' ? row.status === 1 ? 'disabled' : 'enabled' : row.status }); });
  }
  async save(scope: 'global' | 'repository' | 'task', id: number, patches: VariablePatch[]) {
    if (!Array.isArray(patches) || patches.length > 1000) throw new ScopedEnvironmentError('ENV_VALUE_INVALID');
    const model: any = scope === 'global' ? EnvModel : scope === 'repository' ? RepositoryEnvVariableModel : TaskEnvVariableModel;
    const key = scope === 'repository' ? 'profile_id' : 'task_id';
    try {
      await sequelize.transaction(async transaction => {
        await this.owner(scope, id, transaction);
        const rows = await model.unscoped().findAll({ where: scope === 'global' ? {} : { [key]: id }, transaction });
        const existing = new Map<string, ScopedVariable>(rows.map((x: any) => { const row = x.get({ plain: true }); return [x.name, { ...row, status: scope === 'global' ? row.status === 1 ? 'disabled' : 'enabled' : row.status }]; }));
        const seen = new Set<string>();
        for (const patch of patches) {
          validateEnvironmentName(patch.name);
          if (seen.has(patch.name)) throw new ScopedEnvironmentError('ENV_NAME_DUPLICATE');
          seen.add(patch.name);
          const old = existing.get(patch.name);
          if (patch.clear === true) { await model.destroy({ where: { ...(scope === 'global' ? {} : { [key]: id }), name: patch.name }, transaction }); continue; }
          const operation = patch.operation ?? old?.operation ?? 'SET';
          const status = patch.status ?? old?.status ?? 'enabled';
          const is_secret = patch.is_secret ?? old?.is_secret ?? false;
          if (!['SET', 'UNSET'].includes(operation) || !['enabled', 'disabled'].includes(status)) throw new ScopedEnvironmentError('ENV_VALUE_INVALID');
          if (old?.is_secret && !is_secret) throw new ScopedEnvironmentError('ENV_SECRET_UPDATE_INVALID');
          if (patch.value !== undefined && old?.is_secret && patch.replace_secret !== true) throw new ScopedEnvironmentError('ENV_SECRET_UPDATE_INVALID');
          if (patch.value === '********' || patch.value === '••••••••') throw new ScopedEnvironmentError('ENV_SECRET_UPDATE_INVALID');
          const value = operation === 'UNSET' ? null : patch.value === undefined ? old?.value : patch.value;
          if (operation === 'SET') validateEnvironmentValue(value);
          const fields = { ...(scope === 'global' ? {} : { [key]: id }), name: patch.name, value, operation, status: scope === 'global' ? status === 'disabled' ? 1 : 0 : status, is_secret, position: patch.position ?? old?.position ?? 0, labels: patch.labels ?? old?.labels ?? [] };
          if (old) await model.update(fields, { where: { id: old.id }, transaction });
          else await model.create(fields, { transaction });
        }
      });
    } catch (error) { if (error instanceof ScopedEnvironmentError) throw error; throw new ScopedEnvironmentError('ENV_VARIABLE_SAVE_CONFLICT', 409); }
    Logger.info('[environment] variables changed scope=%s owner=%s count=%s secret_replacements=%s', scope, id, patches.length, patches.filter(x => x.replace_secret).length);
    return this.list(scope, id);
  }
  async bind(scope: 'task' | 'subscription', id: number, profileId: number | null) {
    await sequelize.transaction(async transaction => {
      if (scope === 'subscription') {
        const sub = await SubscriptionModel.findByPk(id, { transaction });
        if (!sub) throw new ScopedEnvironmentError('ENV_SUBSCRIPTION_NOT_FOUND', 404);
        await this.profiles.validateBinding(profileId, sub.repository_id, transaction);
        await sub.update({ env_profile_id: profileId }, { transaction });
      } else {
        const task = await TaskModel.findByPk(id, { transaction });
        if (!task) throw new ScopedEnvironmentError('ENV_TASK_NOT_FOUND', 404);
        const { repository_id } = await taskRepository(id, transaction);
        await this.profiles.validateBinding(profileId, repository_id, transaction);
        await task.update({ env_profile_id: profileId }, { transaction });
      }
    });
    Logger.info('[environment] binding changed scope=%s owner=%s profile=%s', scope, id, profileId);
    return { env_profile_id: profileId };
  }
}
