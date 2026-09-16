import { Service } from 'typedi';
import { Repository } from '../data/repository';
import { GitCredentialModel } from '../data/gitCredential';
import CredentialSecretService from './credentialSecret';
import GitCredentialResolver from './gitCredentialResolver';
import { redactGitCredential } from '../shared/gitSecurity';
import { WorkspaceGuard } from './workspaceLocks';
import { WorkspaceError } from '../shared/workspaceError';
@Service()
export default class GitCommandService {
  constructor(
    private secrets: CredentialSecretService,
    private resolver: GitCredentialResolver,
  ) {}
  async run(
    guard: WorkspaceGuard,
    repo: Repository,
    args: string[],
    cwd: string,
    network = false,
    allowFailure = false,
    options: { push?: boolean; outputLimit?: number } = {},
  ) {
    const credential =
      network && repo.default_credential_id
        ? await GitCredentialModel.findByPk(repo.default_credential_id)
        : null;
    if (network && repo.default_credential_id && !credential)
      throw new WorkspaceError('AUTH_FAILED');
    // Local operations do not require an enabled remote identity or SSH authentication.
    const context = await this.resolver.resolve(
      credential?.get({ plain: true }) || null,
      credential ? await this.secrets.getCredentialSecret(credential.id!) : {},
      network ? repo.remote_url : 'https://workspace-local.invalid/local',
      options.push ? 'push' : 'read',
    );
    try {
      const result = await guard.run(
        [
          '--no-optional-locks',
          '--literal-pathspecs',
          '-c',
          'core.hooksPath=/dev/null',
          '-c',
          'core.fsmonitor=false',
          ...args,
        ],
        cwd,
        context.env,
        network ? 300000 : 30000,
        'git',
        options.outputLimit,
      );
      const safe = {
        ...result,
        stdout: redactGitCredential(result.stdout, context.secrets),
        stderr: redactGitCredential(result.stderr, context.secrets),
      };
      if (safe.code && !allowFailure)
        throw new WorkspaceError(
          safe.code === 124
            ? 'GIT_TIMEOUT'
            : safe.code === 125
            ? 'GIT_OUTPUT_LIMIT'
            : network
            ? /authentication failed|permission denied|could not read username/i.test(
                safe.stderr,
              )
              ? 'AUTH_FAILED'
              : 'REMOTE_UNREACHABLE'
            : 'GIT_OPERATION_FAILED',
          undefined,
          safe.code === 124 ? 504 : 409,
        );
      return safe;
    } finally {
      await context.cleanup();
    }
  }
}
