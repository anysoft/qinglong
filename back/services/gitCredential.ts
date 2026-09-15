import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { GitCredential, GitCredentialModel } from '../data/gitCredential';
import { RepositoryModel } from '../data/repository';
import { sequelize } from '../data';
import CredentialSecretService, { CredentialSecret } from './credentialSecret';
import GitCredentialResolver, { runGitProcess } from './gitCredentialResolver';
import { GitResourceError } from '../shared/gitSecurity';
import { inspectSshCredential, publicKeyFingerprint } from './sshCredentialKey';
export type CredentialInput = Partial<GitCredential> & {
  token?: string;
  private_key?: string;
  passphrase?: string;
  replace_secret?: boolean;
};
@Service()
export default class GitCredentialService {
  constructor(
    private secrets: CredentialSecretService,
    private resolver: GitCredentialResolver,
  ) {}
  async get(id: number, transaction?: Transaction) {
    const row = await GitCredentialModel.findByPk(id, { transaction });
    if (!row) throw new GitResourceError('Credential not found', 404);
    return row.get({ plain: true });
  }
  async references(id: number, transaction?: Transaction) {
    const repositories = await RepositoryModel.count({
      where: { default_credential_id: id },
      transaction,
    });
    return { repositories, total: repositories };
  }
  async detail(id: number) {
    const metadata = await this.get(id);
    return {
      ...metadata,
      fingerprint: publicKeyFingerprint(metadata.public_key),
      has_secret: await this.secrets.hasSecret(id),
      used_by: await this.references(id),
    };
  }
  async list() {
    const rows = await GitCredentialModel.findAll({ order: [['id', 'DESC']] });
    return Promise.all(rows.map((row) => this.detail(row.id!)));
  }
  async save(input: CredentialInput) {
    try {
      const id = await sequelize.transaction(async (transaction) => {
        const old = input.id
          ? await this.get(input.id, transaction)
          : undefined;
        const data = { ...old, ...input };
        if (
          !data.name?.trim() ||
          !['github', 'gitlab', 'gitee', 'generic'].includes(
            data.provider || '',
          ) ||
          !['anonymous', 'https_token', 'ssh_key'].includes(
            data.auth_type || '',
          )
        )
          throw new GitResourceError('Invalid credential metadata');
        if (
          !['READ', 'WRITE'].includes(data.capability || 'READ') ||
          !['enabled', 'disabled'].includes(data.status || 'enabled')
        )
          throw new GitResourceError('Invalid credential capability or status');
        let secret: CredentialSecret = old
          ? await this.secrets.getCredentialSecret(old.id!, transaction)
          : {};
        if (data.auth_type === 'anonymous') secret = {};
        else if (
          !old ||
          input.replace_secret ||
          old.auth_type !== data.auth_type
        ) {
          secret =
            data.auth_type === 'https_token'
              ? { token: input.token }
              : {
                  private_key: input.private_key,
                  passphrase: input.passphrase,
                };
        } else if (
          input.token !== undefined ||
          input.private_key !== undefined ||
          input.passphrase !== undefined
        ) {
          throw new GitResourceError(
            'Choose replace secret to change credential material',
          );
        }
        if (
          data.auth_type === 'https_token' &&
          (!secret.token || /[\r\n\0]/.test(secret.token))
        )
          throw new GitResourceError('A valid token is required');
        if (
          data.auth_type === 'ssh_key' &&
          (!secret.private_key?.includes('PRIVATE KEY') ||
            !data.known_hosts?.trim())
        )
          throw new GitResourceError(
            'SSH private key and verified known_hosts are required',
          );
        const fields = {
          name: data.name.trim(),
          provider: data.provider!,
          auth_type: data.auth_type!,
          username: data.username || '',
          public_key: data.public_key || '',
          known_hosts: data.known_hosts || '',
          capability: data.capability || 'READ',
          status: data.status || 'enabled',
        } as GitCredential;
        fields.public_key =
          fields.auth_type === 'ssh_key'
            ? await inspectSshCredential(fields, secret)
            : '';
        const row = old
          ? await GitCredentialModel.findByPk(old.id, { transaction })
          : await GitCredentialModel.create(fields, { transaction });
        if (old) await row!.update(fields, { transaction });
        await this.secrets.setCredentialSecret(row!.id!, secret, transaction);
        return row!.id!;
      });
      return this.detail(id);
    } catch (error) {
      if (error instanceof GitResourceError) throw error;
      throw new GitResourceError(
        'Credential could not be saved (check name uniqueness)',
        409,
      );
    }
  }
  async remove(id: number) {
    return sequelize.transaction(async (transaction) => {
      await this.get(id, transaction);
      if ((await this.references(id, transaction)).total)
        throw new GitResourceError('Credential is in use', 409);
      await GitCredentialModel.destroy({ where: { id }, transaction });
    });
  }
  async testAccess(id: number, remote: string) {
    const credential = await this.get(id);
    const context = await this.resolver.resolve(
      credential,
      await this.secrets.getCredentialSecret(id),
      remote,
    );
    try {
      const result = await runGitProcess(
        'git',
        ['ls-remote', '--', remote],
        context,
      );
      const status = result.code === 0 ? 'available' : 'unreachable';
      await GitCredentialModel.update(
        { last_test_at: new Date(), last_test_result: status },
        { where: { id } },
      );
      // No remote diagnostics in API/errors: a malicious server can reflect or encode secrets.
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
