import fs from 'fs/promises';
import path from 'path';

/** Backend-owned directories, created without staging, global dependencies or legacy configuration. */
export async function bootstrapDirectories(dataRoot: string): Promise<void> {
  const root = path.resolve(dataRoot);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('UNSAFE_DATA_DIRECTORY');
  for (const name of ['db', 'config', 'log', 'syslog', 'upload', 'git', 'worktrees', '.locks', 'tmp']) {
    const target = path.join(root, name);
    await fs.mkdir(target, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('UNSAFE_DATA_DIRECTORY');
  }
}
