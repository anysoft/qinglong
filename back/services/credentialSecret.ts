import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { GitCredentialModel } from '../data/gitCredential';
import { GitResourceError } from '../shared/gitSecurity';
export interface CredentialSecret {
  token?: string;
  private_key?: string;
  passphrase?: string;
}
@Service()
export default class CredentialSecretService {
  // Explicit plaintext-at-rest adapter. Replace here when a managed encryption key exists.
  async getCredentialSecret(
    id: number,
    transaction?: Transaction,
  ): Promise<CredentialSecret> {
    const row = await GitCredentialModel.unscoped().findByPk(id, {
      attributes: ['id', 'secret'],
      transaction,
    });
    if (!row) throw new GitResourceError('Credential not found', 404);
    try {
      return JSON.parse((row.get('secret' as any) as string) || '{}');
    } catch {
      throw new GitResourceError('Credential secret is invalid');
    }
  }
  async setCredentialSecret(
    id: number,
    secret: CredentialSecret,
    transaction: Transaction,
  ) {
    await GitCredentialModel.unscoped().update(
      {
        secret: Object.keys(secret).length ? JSON.stringify(secret) : null,
      } as any,
      { where: { id }, transaction },
    );
  }
  async hasSecret(id: number, transaction?: Transaction) {
    const secret = await this.getCredentialSecret(id, transaction);
    return Boolean(secret.token || secret.private_key);
  }
}
