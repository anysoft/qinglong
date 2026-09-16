import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { sequelize } from '../data';
import { TaskModel } from '../data/task';
import { taskRepository } from './taskRelationships';
import { EnvModel } from '../data/env';
import { SubscriptionModel } from '../data/subscription';
import { RepositoryModel } from '../data/repository';
import { EnvironmentProfile, RepositoryEnvVariableModel, TaskEnvVariableModel, ScopedVariable } from '../data/scopedEnv';
import RepositoryEnvProfileService from './repositoryEnvProfile';
import { ScopedEnvironmentError } from '../shared/scopedEnv';

export type EnvironmentOrigin = 'SYSTEM' | 'GLOBAL' | 'REPOSITORY' | 'TASK';
export interface ResolvedTaskEnvironment {
  variables: Readonly<Record<string, string>>;
  unsetVariables: readonly string[];
  origins: Readonly<Record<string, EnvironmentOrigin>>;
  secretNames: readonly string[];
  profile: EnvironmentProfile | null;
  metadata: { scoped: boolean; task_id?: number; repository_id: number | null; selected_by: string; version: 1 };
}

// Pure merge; never changes the caller's environment or executes Global template code.
export function mergeTaskEnvironment(base: NodeJS.ProcessEnv, globals: ScopedVariable[], repository: ScopedVariable[], task: ScopedVariable[], profile: EnvironmentProfile | null, metadata: ResolvedTaskEnvironment['metadata']): ResolvedTaskEnvironment {
  const variables: Record<string, string> = Object.create(null);
  const origins: Record<string, EnvironmentOrigin> = Object.create(null);
  const unset = new Set<string>();
  const secrets = new Set<string>();
  for (const [name, value] of Object.entries(base)) if (value !== undefined && /^(?:PATH|HOME|LANG|LC_[A-Za-z_]+|TMPDIR|TZ|TERM|QL_DIR|QL_DATA_DIR|BACK_PORT|GRPC_PORT)$/.test(name)) { variables[name] = value; origins[name] = 'SYSTEM'; }
  for (const [rows, origin] of [[globals, 'GLOBAL'], [repository, 'REPOSITORY'], [task, 'TASK']] as const) {
    for (const row of rows) {
      if (row.status === 'disabled') continue;
      origins[row.name] = origin;
      if (row.is_secret) secrets.add(row.name);
      if (row.operation === 'UNSET') { delete variables[row.name]; unset.add(row.name); }
      else { variables[row.name] = row.value ?? ''; unset.delete(row.name); }
    }
  }
  return Object.freeze({ variables: Object.freeze(variables), origins: Object.freeze(origins), unsetVariables: Object.freeze([...unset]), secretNames: Object.freeze([...secrets]), profile: profile ? Object.freeze({ ...profile }) : null, metadata: Object.freeze(metadata) });
}

@Service()
export default class TaskEnvironmentResolver {
  constructor(private profiles: RepositoryEnvProfileService) {}
  async resolve(taskOrId: number | { id?: number } | null, baseEnv: NodeJS.ProcessEnv = process.env, existingTransaction?: Transaction): Promise<ResolvedTaskEnvironment> {
    const read = async (transaction: Transaction) => {
      const taskId = typeof taskOrId === 'number' ? taskOrId : taskOrId?.id;
      const task = taskId ? (await TaskModel.findByPk(taskId, { transaction }))?.get({ plain: true }) : { id: undefined, subscription_id: null, env_profile_id: null };
      if (!task) throw new ScopedEnvironmentError('ENV_TASK_NOT_FOUND', 404);
      const sub = task.subscription_id ? await SubscriptionModel.findByPk(task.subscription_id, { transaction }) : null;
      const repositoryId = taskId ? (await taskRepository(taskId, transaction)).repository_id : null;
      const repo = repositoryId ? await RepositoryModel.findByPk(repositoryId, { transaction }) : null;
      const profileId = task.env_profile_id ?? sub?.env_profile_id ?? repo?.default_env_profile_id;
      const profile = profileId == null ? null : await this.profiles.validateBinding(profileId, repo?.id, transaction) ?? null;
      if (profile?.status === 'disabled') throw new ScopedEnvironmentError('ENV_PROFILE_DISABLED');
      const globals = await EnvModel.unscoped().findAll({ transaction });
      const repoVariables = profile ? await RepositoryEnvVariableModel.unscoped().findAll({ where: { profile_id: profile.id }, transaction }) : [];
      const taskVariables = task.id ? await TaskEnvVariableModel.unscoped().findAll({ where: { task_id: task.id }, transaction }) : [];
      return mergeTaskEnvironment(baseEnv, globals.map(x => ({ ...x.get({ plain: true }), name: x.name!, status: x.status === 1 ? 'disabled' as const : 'enabled' as const })), repoVariables.map(x => x.get({ plain: true })), taskVariables.map(x => x.get({ plain: true })), profile, {
        scoped: true, task_id: task.id, repository_id: repo?.id ?? null,
        selected_by: task.env_profile_id != null ? 'TASK' : sub?.env_profile_id != null ? 'SUBSCRIPTION' : repo?.default_env_profile_id != null ? 'REPOSITORY' : 'NONE', version: 1,
      });
    };
    return existingTransaction ? read(existingTransaction) : sequelize.transaction(read);
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
