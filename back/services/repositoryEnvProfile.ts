import { Service } from 'typedi';
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '../data';
import { EnvironmentProfile, EnvironmentProfileModel, RepositoryEnvVariableModel } from '../data/scopedEnv';
import { RepositoryModel } from '../data/repository';
import { SubscriptionModel } from '../data/subscription';
import { TaskModel } from '../data/task';
import { ScopedEnvironmentError } from '../shared/scopedEnv';
import Logger from '../loaders/logger';

@Service()
export default class RepositoryEnvProfileService {
  async get(id: number, transaction?: Transaction) {
    const row = await EnvironmentProfileModel.findByPk(id, { transaction });
    if (!row) throw new ScopedEnvironmentError('ENV_PROFILE_NOT_FOUND', 404);
    return row.get({ plain: true });
  }
  async validateBinding(id: number | null | undefined, repositoryId: number | null | undefined, transaction?: Transaction) {
    if (id == null) return;
    const profile = await this.get(id, transaction);
    if (!repositoryId || profile.repository_id !== repositoryId) throw new ScopedEnvironmentError('ENV_PROFILE_REPOSITORY_MISMATCH');
    return profile;
  }
  async detail(id: number) {
    const profile = await this.get(id);
    const [repository, subscriptions, tasks, count] = await Promise.all([
      RepositoryModel.findByPk(profile.repository_id),
      SubscriptionModel.count({ where: { env_profile_id: id } }),
      TaskModel.count({ where: { env_profile_id: id } }),
      RepositoryEnvVariableModel.count({ where: { profile_id: id } }),
    ]);
    return { ...profile, is_default: repository?.default_env_profile_id === id, variables_count: count, used_by: { subscriptions, tasks, repository_default: repository?.default_env_profile_id === id } };
  }
  async list(repositoryId: number) {
    const rows = await sequelize.query<any>(`SELECT p.*, r.default_env_profile_id=p.id AS is_default,
      (SELECT COUNT(*) FROM RepositoryEnvVariables v WHERE v.profile_id=p.id) AS variables_count,
      (SELECT COUNT(*) FROM Subscriptions s WHERE s.env_profile_id=p.id) AS subscriptions_count,
      (SELECT COUNT(*) FROM Tasks c WHERE c.env_profile_id=p.id) AS tasks_count
      FROM EnvironmentProfiles p JOIN Repositories r ON r.id=p.repository_id
      WHERE p.repository_id=:repositoryId ORDER BY p.name`, { replacements: { repositoryId }, type: QueryTypes.SELECT });
    return rows.map(({ subscriptions_count, tasks_count, ...row }) => ({ ...row, is_default: !!row.is_default, used_by: { subscriptions: subscriptions_count, tasks: tasks_count, repository_default: !!row.is_default } }));
  }
  async save(input: Partial<EnvironmentProfile> & { is_default?: boolean }) {
    try {
      const id = await sequelize.transaction(async transaction => {
        const old = input.id ? await this.get(input.id, transaction) : undefined;
        const repository_id = old?.repository_id ?? input.repository_id;
        if (!repository_id || !(await RepositoryModel.findByPk(repository_id, { transaction }))) throw new ScopedEnvironmentError('ENV_REPOSITORY_NOT_FOUND', 404);
        const repository = await RepositoryModel.findByPk(repository_id, { transaction });
        if (repository?.storage_state === 'DELETING') throw new ScopedEnvironmentError('ENV_REPOSITORY_DELETING', 409);
        if (old && input.repository_id && old.repository_id !== input.repository_id) throw new ScopedEnvironmentError('ENV_PROFILE_REPOSITORY_MISMATCH');
        const name = (input.name ?? old?.name ?? '').trim();
        if (!name || name.length > 255) throw new ScopedEnvironmentError('ENV_PROFILE_NAME_INVALID');
        const fields = { repository_id, name, description: input.description ?? old?.description ?? '', status: input.status ?? old?.status ?? 'enabled' };
        if (!['enabled', 'disabled'].includes(fields.status)) throw new ScopedEnvironmentError('ENV_STATUS_INVALID');
        const row = old ? await EnvironmentProfileModel.findByPk(old.id, { transaction }) : await EnvironmentProfileModel.create(fields, { transaction });
        if (old) await row!.update(fields, { transaction });
        if (input.is_default === true) await RepositoryModel.update({ default_env_profile_id: row!.id }, { where: { id: repository_id }, transaction });
        if (input.is_default === false) await RepositoryModel.update({ default_env_profile_id: null }, { where: { id: repository_id, default_env_profile_id: row!.id }, transaction });
        return row!.id!;
      });
      Logger.info('[environment] profile saved id=%s', id);
      return this.detail(id);
    } catch (error) {
      if (error instanceof ScopedEnvironmentError) throw error;
      throw new ScopedEnvironmentError('ENV_PROFILE_SAVE_CONFLICT', 409);
    }
  }
  async clone(id: number, name: string) {
    if (typeof name !== 'string' || !name.trim() || name.length > 255) throw new ScopedEnvironmentError('ENV_PROFILE_NAME_INVALID');
    try {
      const newId = await sequelize.transaction(async transaction => {
        const profile = await this.get(id, transaction);
        const copy = await EnvironmentProfileModel.create({ repository_id: profile.repository_id, name: name.trim(), description: profile.description, status: profile.status }, { transaction });
        const rows = await RepositoryEnvVariableModel.unscoped().findAll({ where: { profile_id: id }, transaction });
        await RepositoryEnvVariableModel.bulkCreate(rows.map(row => { const { id: ignored, ...data } = row.get({ plain: true }); return { ...data, profile_id: copy.id }; }), { transaction });
        return copy.id!;
      });
      Logger.info('[environment] profile cloned id=%s', newId);
      return this.detail(newId);
    } catch (error) { if (error instanceof ScopedEnvironmentError) throw error; throw new ScopedEnvironmentError('ENV_PROFILE_SAVE_CONFLICT', 409); }
  }
  async remove(id: number) {
    await sequelize.transaction(async transaction => {
      await this.get(id, transaction);
      for (const [model, key] of [[RepositoryModel, 'default_env_profile_id'], [SubscriptionModel, 'env_profile_id'], [TaskModel, 'env_profile_id']] as const) {
        if (await (model as any).count({ where: { [key]: id }, transaction })) throw new ScopedEnvironmentError('ENV_PROFILE_IN_USE', 409);
      }
      await EnvironmentProfileModel.destroy({ where: { id }, transaction });
    });
    Logger.info('[environment] profile deleted id=%s', id);
  }
}
