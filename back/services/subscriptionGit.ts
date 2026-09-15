import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import { Subscription, SubscriptionModel } from '../data/subscription';
import { RepositoryModel } from '../data/repository';
import { GitCredentialModel } from '../data/gitCredential';
import { sequelize } from '../data';
import { normalizeRepositoryUrl } from '../shared/gitProvider';
import { GitResourceError } from '../shared/gitSecurity';
// Exact string operations used by update.sh:get_uniq_path, not Repository identity.
export function legacyCheckoutName(url: string, branch = '') {
  const trimmed = url.replace(/\/$/, '');
  const repo = trimmed
    .slice(trimmed.lastIndexOf('/') + 1)
    .replace(/\.[^.]*$/, '');
  const parent = url.slice(0, url.lastIndexOf('/'));
  const author = parent
    .slice(parent.lastIndexOf('/') + 1)
    .replace(/^.*:/, '')
    .replace(/^.*\./, '');
  return `${author}_${repo}${branch ? `_${branch}` : ''}`;
}
export function validateLegacyGitArguments(sub: Subscription, remote: string) {
  normalizeRepositoryUrl(remote);
  if (sub.type === 'file')
    throw new GitResourceError(
      'Repository resources cannot back a file subscription',
    );
  if (
    sub.branch &&
    (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(sub.branch) ||
      sub.branch.includes('..') ||
      sub.branch.includes('//'))
  )
    throw new GitResourceError(
      'Branch is not supported by the legacy clone adapter',
    );
  if (sub.extensions && !/^[A-Za-z0-9| ]+$/.test(sub.extensions))
    throw new GitResourceError('Invalid script extensions');
  if (sub.proxy && /[\s\x00-\x1f'"`$\\]/.test(sub.proxy))
    throw new GitResourceError('Invalid proxy');
  const directory = legacyCheckoutName(remote, sub.branch);
  if (
    !directory
      .split('/')
      .every(
        (x) => x && x !== '.' && x !== '..' && /^[A-Za-z0-9_.~-]+$/.test(x),
      )
  )
    throw new GitResourceError(
      'Remote is not supported by the legacy checkout layout',
    );
}
@Service()
export default class SubscriptionGitResolver {
  async resolveSubscriptionGitContext(
    sub: Subscription,
    transaction?: Transaction,
  ) {
    if (!sub.repository_id) {
      if (sub.credential_id)
        throw new GitResourceError(
          'Select a repository before overriding credentials',
        );
      return {
        legacyMode: true as const,
        remoteUrl: sub.url!,
        branch: sub.branch,
        repository: null,
        credential: null,
      };
    }
    const repository = await RepositoryModel.findByPk(sub.repository_id, {
      transaction,
    });
    if (!repository) throw new GitResourceError('Repository not found', 404);
    const credentialId = sub.credential_id ?? repository.default_credential_id;
    const credential = credentialId
      ? await GitCredentialModel.findByPk(credentialId, { transaction })
      : null;
    if (credentialId && !credential)
      throw new GitResourceError('Credential not found', 404);
    if (credential?.status === 'disabled')
      throw new GitResourceError('Credential is disabled');
    const remoteUrl = repository.remote_url;
    validateLegacyGitArguments(sub, remoteUrl);
    const ssh = /^(ssh:\/\/|[^/]+@[^/]+:)/.test(remoteUrl);
    if (
      (credential?.auth_type === 'ssh_key' && !ssh) ||
      (credential?.auth_type === 'https_token' && ssh)
    )
      throw new GitResourceError(
        'Credential type does not match repository transport',
      );
    return {
      legacyMode: false as const,
      remoteUrl,
      branch: sub.branch,
      repository: repository.get({ plain: true }),
      credential: credential?.get({ plain: true }) || null,
    };
  }
  async collisions(sub: Subscription) {
    const effective = await this.resolveSubscriptionGitContext(sub);
    if (sub.type === 'file') return [];
    const target = legacyCheckoutName(effective.remoteUrl, sub.branch);
    const rows = await SubscriptionModel.findAll();
    const result: number[] = [];
    for (const row of rows) {
      if (row.id === sub.id || row.type === 'file') continue;
      let remote = row.url || '';
      if (row.repository_id)
        remote =
          (await RepositoryModel.findByPk(row.repository_id))?.remote_url ||
          remote;
      if (legacyCheckoutName(remote, row.branch) === target)
        result.push(row.id!);
    }
    return result.length
      ? [
          {
            code: 'legacy_checkout_collision',
            subscription_ids: result,
            message:
              'Subscriptions share a legacy checkout directory and can overwrite each other',
          },
        ]
      : [];
  }
  async convert(id: number, credentialId?: number | null) {
    return sequelize.transaction(async (transaction) => {
      const sub = await SubscriptionModel.findByPk(id, { transaction });
      if (!sub) throw new GitResourceError('Subscription not found', 404);
      if (sub.repository_id) return sub.get({ plain: true });
      if (sub.type === 'file')
        throw new GitResourceError('File subscriptions cannot be converted');
      if (sub.type === 'private-repo' && !credentialId)
        throw new GitResourceError(
          'Create and select a reusable credential before converting this private subscription',
        );
      // Embedded credentials require explicit manual cleaning. Never silently extract secrets.
      const identity = normalizeRepositoryUrl(sub.url || '');
      const [repo] = await RepositoryModel.findOrCreate({
        where: { normalized_url: identity.normalized_url },
        defaults: {
          ...identity,
          name: sub.name || identity.repository_name,
          default_credential_id: null,
        },
        transaction,
      });
      // Preserve exact clone naming/transport when normalized identity is shared.
      if (
        legacyCheckoutName(repo.remote_url, sub.branch) !==
        legacyCheckoutName(sub.url!, sub.branch)
      )
        throw new GitResourceError(
          'An equivalent repository uses a different remote spelling; review clone-path compatibility before linking',
        );
      const payload = {
        ...sub.get({ plain: true }),
        repository_id: repo.id,
        credential_id: credentialId || null,
      };
      await this.resolveSubscriptionGitContext(payload, transaction);
      await sub.update(
        { repository_id: repo.id, credential_id: credentialId || null },
        { transaction },
      );
      return sub.get({ plain: true });
    });
  }
}
