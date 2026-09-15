import { Service, Inject } from 'typedi';
import winston from 'winston';
import { FindOptions } from 'sequelize';
import { Env, EnvModel, EnvStatus } from '../data/env';
import ScopedEnvVariableService from './scopedEnvVariable';
import RepositoryEnvProfileService from './repositoryEnvProfile';
import { ScopedEnvironmentError, validateEnvironmentName } from '../shared/scopedEnv';

// B13 SDK bridge: all operations use the single Global store and masked responses.
@Service()
export default class EnvService {
  constructor(@Inject('logger') private logger: winston.Logger) {}
  private variables() { return new ScopedEnvVariableService(new RepositoryEnvProfileService()); }
  public async envs(searchText = '', query: any = {}): Promise<Env[]> {
    const rows = await this.variables().list('global', 0);
    return rows.map((row: any) => ({ ...row, status: row.status === 'disabled' ? 1 : 0, value: row.is_secret ? undefined : row.value ?? undefined }))
      .filter((row: any) => (!searchText || row.name.includes(searchText)) && Object.entries(query).every(([key, value]) => typeof value === 'object' || row[key] === value));
  }
  public async getDb(query: FindOptions<Env>['where']): Promise<Env> {
    const rows = await this.envs('', query);
    if (!rows[0]) throw new ScopedEnvironmentError('ENV_VARIABLE_NOT_FOUND', 404);
    return rows[0];
  }
  public async create(payloads: Env[]): Promise<Env[]> {
    const names = new Set((await this.envs()).map(x => x.name));
    if (payloads.some(x => names.has(x.name))) throw new ScopedEnvironmentError('ENV_NAME_DUPLICATE');
    await this.variables().save('global', 0, payloads.map(x => ({ ...x, name: x.name!, status: x.status === 1 ? 'disabled' : 'enabled' })));
    return (await this.envs()).filter(x => payloads.some(y => y.name === x.name));
  }
  public async insert(payloads: Env[]) { return this.create(payloads); }
  public async update(payload: Env): Promise<Env> {
    const old = await this.getDb({ id: payload.id });
    if (payload.name && payload.name !== old.name) throw new ScopedEnvironmentError('ENV_NAME_IMMUTABLE');
    await this.variables().save('global', 0, [{ ...payload, name: payload.name ?? old.name!, status: payload.status == null ? undefined : payload.status === 1 ? 'disabled' : 'enabled' }]);
    return this.getDb({ id: old.id });
  }
  public async remove(ids: number[]) { await EnvModel.destroy({ where: { id: ids } }); }
  public async disabled(ids: number[]) { await EnvModel.update({ status: EnvStatus.disabled }, { where: { id: ids } }); }
  public async enabled(ids: number[]) { await EnvModel.update({ status: EnvStatus.normal }, { where: { id: ids } }); }
  public async move(id: number, { toIndex }: { fromIndex: number; toIndex: number }) { await EnvModel.update({ position: -toIndex }, { where: { id } }); return this.getDb({ id }); }
  public async updateNames({ ids, name }: { ids: number[]; name: string }) {
    if (ids.length !== 1) throw new ScopedEnvironmentError('ENV_NAME_DUPLICATE');
    return this.update({ id: ids[0], name });
  }
  public async pin(ids: number[]) { await EnvModel.update({ isPinned: 1 }, { where: { id: ids } }); }
  public async unPin(ids: number[]) { await EnvModel.update({ isPinned: 0 }, { where: { id: ids } }); }
  public async addLabels(ids: number[], labels: string[]) {
    for (const row of await this.envs()) if (ids.includes(row.id!)) await EnvModel.update({ labels: [...new Set([...(row.labels || []), ...labels])] }, { where: { id: row.id } });
    return (await this.envs()).filter(x => ids.includes(x.id!));
  }
  public async removeLabels(ids: number[], labels: string[]) {
    for (const row of await this.envs()) if (ids.includes(row.id!)) await EnvModel.update({ labels: (row.labels || []).filter(x => !labels.includes(x)) }, { where: { id: row.id } });
    return (await this.envs()).filter(x => ids.includes(x.id!));
  }
}
