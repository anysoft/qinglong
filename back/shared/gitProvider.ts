export type GitProvider = 'github' | 'gitlab' | 'gitee' | 'generic';
export interface RepositoryIdentity {
  remote_url: string;
  normalized_url: string;
  provider: GitProvider;
  host: string;
  path: string;
  owner: string;
  repository_name: string;
}
const providers: Record<string, GitProvider> = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'gitee.com': 'gitee',
};
export function normalizeRepositoryUrl(input: string): RepositoryIdentity {
  const invalid = () =>
    new Error(
      'Invalid repository URL (use HTTPS or SSH without embedded credentials)',
    );
  if (typeof input !== 'string' || !input || /[\s\x00-\x1f\\?#%]/.test(input))
    throw invalid();
  const scp = input.match(/^([a-zA-Z0-9_-]+)@([a-zA-Z0-9.-]+):(.+)$/);
  const source = scp ? `ssh://${scp[1]}@${scp[2]}/${scp[3]}` : input;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw invalid();
  }
  if (
    !['https:', 'ssh:'].includes(url.protocol) ||
    url.password ||
    (url.protocol === 'https:' && url.username)
  )
    throw invalid();
  if (
    url.protocol === 'ssh:' &&
    url.username &&
    !/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(url.username)
  )
    throw invalid();
  // Check original path before URL's dot-segment canonicalization.
  const rawPath = scp ? scp[3] : source.replace(/^[a-z]+:\/\/[^/]+\//, '');
  if (rawPath.split('/').some((x) => x === '.' || x === '..')) throw invalid();
  const host = url.hostname.toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(host)) throw invalid();
  const repoPath = url.pathname
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/, '')
    .replace(/\/{2,}/g, '/');
  if (
    !repoPath ||
    !repoPath
      .split('/')
      .every((x) => /^[a-zA-Z0-9_~.-]+$/.test(x) && x !== '.' && x !== '..')
  )
    throw invalid();
  const port =
    url.port && !(url.protocol === 'ssh:' && url.port === '22')
      ? `:${url.port}`
      : '';
  const provider = providers[host] || 'generic';
  const identityPath =
    provider === 'github' ? repoPath.toLowerCase() : repoPath;
  return {
    remote_url: input,
    normalized_url: `${host}${port}/${identityPath}`,
    provider,
    host,
    path: repoPath,
    owner: repoPath.includes('/')
      ? repoPath.slice(0, repoPath.lastIndexOf('/'))
      : '',
    repository_name: repoPath.split('/').pop()!,
  };
}
