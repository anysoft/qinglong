import path from 'path';
import { createHash } from 'crypto';
import GitCredentialResolver, { runGitProcess } from './gitCredentialResolver';
import { GitCredential } from '../data/gitCredential';
import { CredentialSecret } from './credentialSecret';
import { GitResourceError } from '../shared/gitSecurity';

// ssh-keygen handles OpenSSH/PEM and encrypted keys without passing secrets in argv.
export async function inspectSshCredential(
  credential: GitCredential,
  secret: CredentialSecret,
) {
  const context = await new GitCredentialResolver().resolve(
    { ...credential, status: 'enabled' },
    secret,
    'ssh://git@credential-validation.invalid/key',
  );
  try {
    const result = await runGitProcess(
      'ssh-keygen',
      ['-y', '-f', path.join(context.directory, 'identity')],
      context,
      10000,
    );
    // OpenSSH may append the key comment; persist only the algorithm and key blob.
    const publicKey = result.output.trim().split(/\s+/).slice(0, 2).join(' ');
    if (
      result.code !== 0 ||
      !/^(ssh-|ecdsa-)[A-Za-z0-9@.-]+ [A-Za-z0-9+/=]+$/.test(publicKey)
    )
      throw new GitResourceError('Invalid SSH private key or passphrase');
    return publicKey;
  } finally {
    await context.cleanup();
  }
}
export function publicKeyFingerprint(publicKey?: string) {
  const encoded = publicKey?.split(' ')[1];
  return encoded
    ? 'SHA256:' +
        createHash('sha256')
          .update(Buffer.from(encoded, 'base64'))
          .digest('base64')
          .replace(/=+$/, '')
    : null;
}
