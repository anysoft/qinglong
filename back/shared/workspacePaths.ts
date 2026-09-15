import fs from 'fs/promises';
import path from 'path';
import { WorkspaceError } from './workspaceError';
export function workspaceId(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0)
    throw new WorkspaceError(
      'PATH_CONFLICT',
      'PATH_CONFLICT: invalid resource ID',
    );
  return Number(value);
}
export class RepositoryPathResolver {
  constructor(private dataPath: string) {}
  async root() {
    return fs.realpath(this.dataPath);
  }
  async base(name: 'git' | 'worktrees' | '.locks') {
    const target = path.join(await this.root(), name);
    await this.assertSafe(target);
    await fs.mkdir(target, { recursive: true, mode: 0o700 });
    await this.assertSafe(target);
    return target;
  }
  async repository(repo: { id?: number; host: string; path?: string }) {
    const host = repo.host.toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(host) || host === '.' || host === '..')
      throw new WorkspaceError('PATH_CONFLICT');
    const result = path.join(
      await this.base('git'),
      host,
      `repository-${workspaceId(repo.id)}.git`,
    );
    await this.assertSafe(result);
    return result;
  }
  async worktree(repositoryId: number, id: number) {
    const result = path.join(
      await this.base('worktrees'),
      `repository-${workspaceId(repositoryId)}`,
      `wt-${workspaceId(id)}`,
    );
    await this.assertSafe(result);
    return result;
  }
  async lock(kind: 'repository' | 'worktree', id: number) {
    return path.join(
      await this.base('.locks'),
      `${kind}-${workspaceId(id)}.lock`,
    );
  }
  async assertSafe(target: string) {
    const root = await this.root(),
      relative = path.relative(root, target);
    if (
      relative === '..' ||
      relative.startsWith('../') ||
      path.isAbsolute(relative)
    )
      throw new WorkspaceError('PATH_CONFLICT');
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new WorkspaceError(
            'PATH_CONFLICT',
            'PATH_CONFLICT: managed path contains a symlink',
          );
      } catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  async parents(target: string) {
    await this.assertSafe(target);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await this.assertSafe(target);
  }
  async noSymlinks(target: string) {
    await this.assertSafe(target);
    const stat = await fs.lstat(target);
    if (stat.isDirectory())
      for (const name of await fs.readdir(target))
        await this.noSymlinks(path.join(target, name));
  }
}
