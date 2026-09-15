import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { Repository, RepositoryModel } from '../data/repository';
import { SubscriptionModel } from '../data/subscription';
import { GitCredentialModel } from '../data/gitCredential';
import { sequelize } from '../data';
import { normalizeRepositoryUrl } from '../shared/gitProvider';
import { GitResourceError } from '../shared/gitSecurity';
import CredentialSecretService from './credentialSecret';
import GitCredentialResolver, { runGitProcess } from './gitCredentialResolver';
@Service()
export default class RepositoryService {
  constructor(
    private secrets: CredentialSecretService,
    private resolver: GitCredentialResolver,
  ) {}
  async get(id: number, transaction?: Transaction) {
    const row = await RepositoryModel.findByPk(id, { transaction });
    if (!row) throw new GitResourceError('Repository not found', 404);
    return row.get({ plain: true });
  }
  async detail(id: number) {
    return {
      ...(await this.get(id)),
      subscriptions_count: await SubscriptionModel.count({
        where: { repository_id: id },
      }),
    };
  }
  async list() {
    const rows = await RepositoryModel.findAll({ order: [['id', 'DESC']] });
    return Promise.all(rows.map((x) => this.detail(x.id!)));
  }
  async save(input: Partial<Repository>) {
    try {
      const id = await sequelize.transaction(async (transaction) => {
        const old = input.id
          ? await this.get(input.id, transaction)
          : undefined;
        const identity = normalizeRepositoryUrl(
          input.remote_url || old?.remote_url || '',
        );
        if (old && old.normalized_url !== identity.normalized_url)
          throw new GitResourceError(
            'Repository identity is immutable; create a different repository',
          );
        // Transport changes would silently change existing subscription clone behavior.
        if (old && input.remote_url && input.remote_url !== old.remote_url)
          throw new GitResourceError('Repository remote is immutable');
        const credential =
          input.default_credential_id === undefined
            ? old?.default_credential_id || null
            : input.default_credential_id;
        if (
          credential &&
          !(await GitCredentialModel.findByPk(credential, { transaction }))
        )
          throw new GitResourceError('Credential not found', 404);
        const fields = {
          ...identity,
          name: (input.name || old?.name || identity.repository_name).trim(),
          default_credential_id: credential,
        };
        if (old) {
          await RepositoryModel.update(fields, {
            where: { id: old.id },
            transaction,
          });
          return old.id!;
        }
        return (await RepositoryModel.create(fields, { transaction })).id!;
      });
      return this.detail(id);
    } catch (error) {
      if (error instanceof GitResourceError) throw error;
      throw new GitResourceError(
        'Repository already exists or could not be saved',
        409,
      );
    }
  }
  async remove(id: number) {
    return sequelize.transaction(async (transaction) => {
      await this.get(id, transaction);
      if (
        await SubscriptionModel.count({
          where: { repository_id: id },
          transaction,
        })
      )
        throw new GitResourceError('Repository is in use', 409);
      await RepositoryModel.destroy({ where: { id }, transaction });
    });
  }
  async testAccess(id: number) {
    const repo = await this.get(id);
    const row = repo.default_credential_id
      ? await GitCredentialModel.findByPk(repo.default_credential_id)
      : null;
    if (repo.default_credential_id && !row)
      throw new GitResourceError('Credential not found', 404);
    const context = await this.resolver.resolve(
      row?.get({ plain: true }) || null,
      row ? await this.secrets.getCredentialSecret(row.id!) : {},
      repo.remote_url,
    );
    try {
      const result = await runGitProcess(
        'git',
        ['ls-remote', '--', repo.remote_url],
        context,
      );
      const status = result.code === 0 ? 'available' : 'unreachable';
      await RepositoryModel.update({ status }, { where: { id } });
      return {
        status,
        message:
          result.code === 0
            ? 'Repository access succeeded'
            : 'Repository access failed; verify credentials, host key and connectivity',
      };
    } finally {
      await context.cleanup();
    }
  }
}
