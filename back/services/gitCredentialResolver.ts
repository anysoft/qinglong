import { Service } from 'typedi';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { GitCredential } from '../data/gitCredential';
import { CredentialSecret } from './credentialSecret';
import { normalizeRepositoryUrl } from '../shared/gitProvider';
import {
  GitResourceError,
  quoteGitShell,
  redactGitCredential,
} from '../shared/gitSecurity';
export interface GitAccessContext {
  remote: string;
  env: NodeJS.ProcessEnv;
  directory: string;
  secrets: string[];
  cleanup: () => Promise<void>;
}
@Service()
export default class GitCredentialResolver {
  async resolve(
    credential: GitCredential | null,
    secret: CredentialSecret,
    remote: string,
    operation: 'read' | 'push' = 'read',
  ): Promise<GitAccessContext> {
    normalizeRepositoryUrl(remote);
    if (credential?.status === 'disabled')
      throw new GitResourceError('Credential is disabled');
    if (operation === 'push' && credential?.capability !== 'WRITE')
      throw new GitResourceError('Credential does not permit push');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-git-'));
    await fs.chmod(directory, 0o700);
    const cleanup = () => fs.rm(directory, { recursive: true, force: true });
    try {
      const env = { ...process.env };
      // Do not inherit unrelated Git config, helpers, agent credentials or tracing.
      for (const key of Object.keys(env))
        if (/^(GIT_|SSH_ASKPASS|SSH_AUTH_SOCK)/.test(key)) delete env[key];
      Object.assign(env, {
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_COUNT: '2',
        GIT_CONFIG_KEY_0: 'credential.helper',
        GIT_CONFIG_VALUE_0: '',
        GIT_CONFIG_KEY_1: 'http.followRedirects',
        GIT_CONFIG_VALUE_1: 'false',
        GIT_ALLOW_PROTOCOL: 'https:ssh',
      });
      const auth = credential?.auth_type || 'anonymous';
      const isSsh = /^(ssh:\/\/|[^/]+@[^/]+:)/.test(remote);
      if ((auth === 'https_token' && isSsh) || (auth === 'ssh_key' && !isSsh))
        throw new GitResourceError(
          'Credential type does not match repository transport',
        );
      const dataFile = path.join(directory, 'secret.json');
      const askpass = path.join(directory, 'askpass');
      await fs.writeFile(
        dataFile,
        JSON.stringify({ ...secret, username: credential?.username || 'git' }),
        { mode: 0o600, flag: 'wx' },
      );
      // Executable helper contains no secret. Secret/key data files stay 0600.
      await fs.writeFile(
        askpass,
        `#!/bin/sh\nexec ${quoteGitShell(
          process.execPath,
        )} -e 'const fs=require("fs");const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const p=process.argv[2]||"";process.stdout.write((/username/i.test(p)?s.username:(s.token||s.passphrase||""))+"\\n");' ${quoteGitShell(
          dataFile,
        )} "$1"\n`,
        { mode: 0o700, flag: 'wx' },
      );
      env.GIT_ASKPASS = askpass;
      if (auth === 'https_token' && !secret.token)
        throw new GitResourceError('Credential token is missing');
      if (isSsh) {
        if (!credential?.known_hosts?.trim())
          throw new GitResourceError(
            'SSH known_hosts is required; verify the host key before saving',
          );
        const knownHosts = path.join(directory, 'known_hosts');
        await fs.writeFile(knownHosts, credential.known_hosts, {
          mode: 0o600,
          flag: 'wx',
        });
        let identity = ' -o IdentityFile=none';
        if (auth === 'ssh_key') {
          if (!secret.private_key)
            throw new GitResourceError('SSH private key is missing');
          const key = path.join(directory, 'identity');
          await fs.writeFile(key, secret.private_key + '\n', {
            mode: 0o600,
            flag: 'wx',
          });
          identity = ` -i ${quoteGitShell(key)}`;
        }
        env.GIT_SSH_COMMAND = `ssh -F /dev/null -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o GlobalKnownHostsFile=/dev/null -o UserKnownHostsFile=${quoteGitShell(
          knownHosts,
        )} -o ConnectTimeout=15${identity}`;
        env.SSH_ASKPASS = askpass;
        env.SSH_ASKPASS_REQUIRE = 'force';
        env.DISPLAY = ':0';
      }
      return {
        remote,
        env,
        directory,
        cleanup,
        secrets: [secret.token, secret.private_key, secret.passphrase].filter(
          Boolean,
        ) as string[],
      };
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
}
// Bounded output is redacted after collection, including secrets split across chunks.
export async function runGitProcess(
  executable: string,
  args: string[],
  context: GitAccessContext,
  timeout = 30000,
  onSpawn?: (pid: number) => void,
) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    let output = '';
    let timedOut = false;
    let overflow = false;
    const cp = spawn(executable, args, {
      cwd: context.directory,
      env: context.env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = (data: Buffer) => {
      if (overflow) return;
      output += data.toString();
      if (output.length > 4 * 1024 * 1024) {
        overflow = true;
        output = '';
      }
    };
    cp.stdout.on('data', append);
    cp.stderr.on('data', append);
    cp.on('spawn', () => {
      if (cp.pid) onSpawn?.(cp.pid);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (cp.pid) terminateGitProcess(cp.pid);
    }, timeout);
    cp.on('error', () => {
      output = 'Git process could not start';
    });
    cp.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        code: timedOut ? 124 : code ?? 1,
        output: overflow
          ? 'Git output exceeded the safe capture limit; output omitted\n'
          : redactGitCredential(output, context.secrets),
      });
    });
  });
}

// Each invocation owns a process group; no unrelated scheduler processes are signalled.
export function terminateGitProcess(pid: number) {
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL');
  } catch {}
}
