import 'reflect-metadata';
import path from 'path';
import { Container } from 'typedi';
import config from './config';
import { sequelize } from './data';
import { SubscriptionModel } from './data/subscription';
import SubscriptionGitResolver from './services/subscriptionGit';
import CredentialSecretService from './services/credentialSecret';
import GitCredentialResolver, {
  runGitProcess,
  terminateGitProcess,
} from './services/gitCredentialResolver';

export async function runRepositorySubscription(id: number) {
  const sub = await SubscriptionModel.findByPk(id);
  if (!sub) throw new Error('Subscription not found');
  const resolved = await Container.get(
    SubscriptionGitResolver,
  ).resolveSubscriptionGitContext(sub.get({ plain: true }));
  if (resolved.legacyMode) throw new Error('Repository subscription required');
  const secret = resolved.credential
    ? await Container.get(CredentialSecretService).getCredentialSecret(
        resolved.credential.id!,
      )
    : {};
  let context:
    | Awaited<ReturnType<GitCredentialResolver['resolve']>>
    | undefined;
  let pid: number | undefined;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (pid) terminateGitProcess(pid);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  try {
    context = await Container.get(GitCredentialResolver).resolve(
      resolved.credential,
      secret,
      resolved.remoteUrl,
    );
    if (stopped) return 130;
    context.env.SUB_ID = String(id);
    // Same positional ql repo contract; clone/copy/scanner logic stays in update.sh.
    const args = [
      path.join(config.rootPath, 'shell/update.sh'),
      'repo',
      resolved.remoteUrl,
      sub.whitelist || '',
      sub.blacklist || '',
      sub.dependences || '',
      sub.branch || '',
      sub.extensions || '',
      sub.proxy || '',
      String(sub.autoAddCron == null ? true : Boolean(sub.autoAddCron)),
      String(sub.autoDelCron == null ? true : Boolean(sub.autoDelCron)),
    ];
    const result = await runGitProcess(
      '/bin/bash',
      args,
      context,
      60 * 60 * 1000,
      (child) => {
        pid = child;
        if (stopped) terminateGitProcess(child);
      },
    );
    process.stdout.write(result.output);
    return stopped ? 130 : result.code;
  } finally {
    process.removeListener('SIGTERM', stop);
    process.removeListener('SIGINT', stop);
    await context?.cleanup();
  }
}
if (require.main === module) {
  const id = Number(process.argv[2]);
  (Number.isSafeInteger(id) && id > 0
    ? runRepositorySubscription(id)
    : Promise.reject(new Error('Invalid subscription'))
  )
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      process.stderr.write(
        'Repository subscription failed; verify repository and credential configuration\n',
      );
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}
