import { Service } from 'typedi';
import { sequelize } from '../data';
import { Crontab, CrontabModel } from '../data/cron';
import { EnvModel } from '../data/env';
import { SubscriptionModel } from '../data/subscription';
import { RepositoryModel } from '../data/repository';
import { EnvironmentProfile, RepositoryEnvVariableModel, TaskEnvVariableModel, ScopedVariable } from '../data/scopedEnv';
import RepositoryEnvProfileService from './repositoryEnvProfile';
import { ENV_NAME, ScopedEnvironmentError } from '../shared/scopedEnv';

export type EnvironmentOrigin = 'SYSTEM' | 'GLOBAL' | 'REPOSITORY' | 'TASK';
export interface ResolvedTaskEnvironment {
  variables: Readonly<Record<string, string>>;
  unsetVariables: readonly string[];
  origins: Readonly<Record<string, EnvironmentOrigin>>;
  secretNames: readonly string[];
  overlay: Readonly<Record<string, string>>;
  profile: EnvironmentProfile | null;
  metadata: { scoped: boolean; task_id?: number; repository_id: number | null; selected_by: string; version: 1 };
}

// Pure merge; never changes the caller's environment or executes Global template code.
export function mergeTaskEnvironment(base: NodeJS.ProcessEnv, globals: { name?: string; value?: string }[], repository: ScopedVariable[], task: ScopedVariable[], profile: EnvironmentProfile | null, metadata: ResolvedTaskEnvironment['metadata']): ResolvedTaskEnvironment {
  const variables: Record<string, string> = Object.create(null);
  const origins: Record<string, EnvironmentOrigin> = Object.create(null);
  const overlay: Record<string, string> = Object.create(null);
  const unset = new Set<string>();
  const secrets = new Set<string>();
  for (const [name, value] of Object.entries(base)) if (value !== undefined) { variables[name] = value; origins[name] = 'SYSTEM'; }
  const groups = new Map<string, string[]>();
  for (const row of globals) if (row.name && ENV_NAME.test(row.name)) groups.set(row.name, [...(groups.get(row.name) || []), row.value ?? '']);
  for (const [name, values] of groups) { variables[name] = values.join('&'); origins[name] = 'GLOBAL'; }
  for (const [rows, origin] of [[repository, 'REPOSITORY'], [task, 'TASK']] as const) {
    for (const row of rows) {
      if (row.status === 'disabled') continue;
      origins[row.name] = origin;
      if (row.is_secret) secrets.add(row.name);
      if (row.operation === 'UNSET') { delete variables[row.name]; delete overlay[row.name]; unset.add(row.name); }
      else { variables[row.name] = row.value ?? ''; overlay[row.name] = row.value ?? ''; unset.delete(row.name); }
    }
  }
  return Object.freeze({ variables: Object.freeze(variables), overlay: Object.freeze(overlay), origins: Object.freeze(origins), unsetVariables: Object.freeze([...unset]), secretNames: Object.freeze([...secrets]), profile: profile ? Object.freeze({ ...profile }) : null, metadata: Object.freeze(metadata) });
}

@Service()
export default class TaskEnvironmentResolver {
  constructor(private profiles: RepositoryEnvProfileService) {}
  async resolve(taskOrId: number | Crontab, baseEnv: NodeJS.ProcessEnv = process.env): Promise<ResolvedTaskEnvironment> {
    return sequelize.transaction(async transaction => {
      const task = typeof taskOrId === 'number' ? (await CrontabModel.findByPk(taskOrId, { transaction }))?.get({ plain: true }) : taskOrId;
      if (!task) throw new ScopedEnvironmentError('ENV_TASK_NOT_FOUND', 404);
      const sub = task.sub_id ? await SubscriptionModel.findByPk(task.sub_id, { transaction }) : null;
      const repo = sub?.repository_id ? await RepositoryModel.findByPk(sub.repository_id, { transaction }) : null;
      const profileId = task.env_profile_id ?? sub?.env_profile_id ?? repo?.default_env_profile_id;
      const profile = profileId == null ? null : await this.profiles.validateBinding(profileId, repo?.id, transaction) ?? null;
      if (profile?.status === 'disabled') throw new ScopedEnvironmentError('ENV_PROFILE_DISABLED');
      const globals = await EnvModel.findAll({ where: { status: 0 }, order: [['isPinned', 'DESC'], ['position', 'DESC'], ['createdAt', 'ASC']], transaction });
      const repoVariables = profile ? await RepositoryEnvVariableModel.unscoped().findAll({ where: { profile_id: profile.id }, transaction }) : [];
      const taskVariables = task.id ? await TaskEnvVariableModel.unscoped().findAll({ where: { cron_id: task.id }, transaction }) : [];
      return mergeTaskEnvironment(baseEnv, globals.map(x => x.get({ plain: true })), repoVariables.map(x => x.get({ plain: true })), taskVariables.map(x => x.get({ plain: true })), profile, {
        scoped: !!profile || taskVariables.length > 0, task_id: task.id, repository_id: repo?.id ?? null,
        selected_by: task.env_profile_id != null ? 'TASK' : sub?.env_profile_id != null ? 'SUBSCRIPTION' : repo?.default_env_profile_id != null ? 'REPOSITORY' : 'NONE', version: 1,
      });
    });
  }
  async preview(taskId: number) {
    const resolved = await this.resolve(taskId);
    // Inherited host values may contain unrelated backend credentials. Preview reveals names only.
    return { profile: resolved.profile, metadata: resolved.metadata, variables: Object.entries(resolved.origins).map(([name, origin]) => ({
      name, origin, operation: resolved.unsetVariables.includes(name) ? 'UNSET' : 'SET',
      is_secret: resolved.secretNames.includes(name) || origin === 'SYSTEM',
      value: resolved.secretNames.includes(name) || origin === 'SYSTEM' ? null : resolved.variables[name] ?? null,
      display: resolved.secretNames.includes(name) || origin === 'SYSTEM' ? '********' : resolved.variables[name] ?? null,
    })) };
  }
}
