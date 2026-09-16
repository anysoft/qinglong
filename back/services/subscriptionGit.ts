import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { Subscription } from '../data/subscription';
import { RepositoryModel } from '../data/repository';
import { GitCredentialModel } from '../data/gitCredential';
import { GitResourceError } from '../shared/gitSecurity';
@Service()
export default class SubscriptionGitResolver {
  async resolveSubscriptionGitContext(
    sub: Subscription,
    transaction?: Transaction,
  ) {
    if (!Number.isSafeInteger(sub.repository_id) || sub.repository_id <= 0) throw new GitResourceError('Repository is required');
    const repository = await RepositoryModel.findByPk(sub.repository_id, {
      transaction,
    });
    if (!repository) throw new GitResourceError('Repository not found', 404);
    const credentialId = repository.default_credential_id;
    const credential = credentialId
      ? await GitCredentialModel.findByPk(credentialId, { transaction })
      : null;
    if (credentialId && !credential)
      throw new GitResourceError('Credential not found', 404);
    if (credential?.status === 'disabled')
      throw new GitResourceError('Credential is disabled');
    const remoteUrl = repository.remote_url;
    const ssh = /^(ssh:\/\/|[^/]+@[^/]+:)/.test(remoteUrl);
    if (
      (credential?.auth_type === 'ssh_key' && !ssh) ||
      (credential?.auth_type === 'https_token' && ssh)
    )
      throw new GitResourceError(
        'Credential type does not match repository transport',
      );
    return {
      remoteUrl,
      branch: sub.branch,
      repository: repository.get({ plain: true }),
      credential: credential?.get({ plain: true }) || null,
    };
  }
}
