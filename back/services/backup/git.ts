import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { fail, openRegular, writeAll, syncDirectory } from './files';
import { randomUUID } from 'crypto';
import { RepositoryPathResolver } from '../../shared/workspacePaths';
import { backupDatabase } from './sqlite';
function id(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) fail('BACKUP_GIT_INVALID');
  return value;
}
export function repositoryRelative(repo: { id: number; host: string }) {
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(repo.host) || repo.host === '..')
    fail('BACKUP_GIT_INVALID');
  return `git/${repo.host}/repository-${id(repo.id)}.git`;
}
export const worktreeRelative = (row: { id: number; repository_id: number }) =>
  `worktrees/repository-${id(row.repository_id)}/wt-${id(row.id)}`;
async function git(args: string[], cwd: string) {
  return new Promise<string>((resolve, reject) =>
    execFile(
      'git',
      [
        '--no-optional-locks',
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        ...args,
      ],
      {
        cwd,
        env: {
          PATH: '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin',
          HOME: cwd,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_TERMINAL_PROMPT: '0',
        },
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout) =>
        error
          ? reject(new Error('BACKUP_GIT_INTEGRITY_FAILED'))
          : resolve(stdout.trim()),
    ),
  );
}
export class BackupRestoreGitRepairService {
  private async safeConfiguration(bare: string, root: string) {
    const configuration = await git(
      [
        'config',
        '--file',
        path.join(bare, 'config'),
        '--no-includes',
        '--null',
        '--list',
      ],
      root,
    );
    for (const field of configuration.split('\0').filter(Boolean)) {
      const key = field.split('\n')[0].toLowerCase();
      if (
        /^include(if)?\./.test(key) ||
        /^filter\..*\.(clean|smudge|process)$/.test(key) ||
        /^diff\..*\.(command|textconv)$/.test(key) ||
        [
          'core.worktree',
          'extensions.worktreeconfig',
          'diff.external',
          'core.alternaterefscommand',
        ].includes(key)
      )
        fail('BACKUP_GIT_CONFIG_UNSUPPORTED');
    }
  }
  private async registration(bare: string, target: string, root: string) {
    const resolver = new RepositoryPathResolver(root);
    await resolver.assertSafe(target);
    await resolver.assertSafe(path.join(target, '.git'));
    const input = await openRegular(path.join(target, '.git'), false);
    let text: string;
    try {
      if ((await input.stat()).size > 4096) fail('BACKUP_GIT_INVALID');
      text = await input.readFile('utf8');
    } finally {
      await input.close();
    }
    if (!/^gitdir: [^\r\n]+\r?\n?$/.test(text!)) fail('BACKUP_GIT_INVALID');
    const key = path.basename(text!.trim().slice(8));
    if (!/^[A-Za-z0-9_.-]+$/.test(key) || key === '.' || key === '..')
      fail('BACKUP_GIT_INVALID');
    const admin = path.join(bare, 'worktrees', key);
    await this.safeAdmin(bare, admin, root);
    return admin;
  }
  private async safeAdmin(bare: string, admin: string, root: string) {
    const resolver = new RepositoryPathResolver(root);
    await resolver.assertSafe(admin);
    await resolver.assertSafe(path.join(admin, 'commondir'));
    const common = await openRegular(path.join(admin, 'commondir'), false);
    try {
      if (
        (await common.stat()).size > 4096 ||
        path.resolve(admin, (await common.readFile('utf8')).trim()) !== bare
      )
        fail('BACKUP_GIT_INVALID');
    } finally {
      await common.close();
    }
  }
  private async writeRegistration(file: string, value: string) {
    const original = await openRegular(file, false);
    let mode: number;
    try {
      mode = (await original.stat()).mode & 0o777;
    } finally {
      await original.close();
    }
    const temporary = file + '.restore-' + randomUUID(),
      output = await fs.open(temporary, 'wx', 0o600);
    try {
      try {
        await writeAll(output, Buffer.from(value));
        await output.chmod(mode!);
        await output.sync();
      } finally {
        await output.close();
      }
      await fs.rename(temporary, file);
      await syncDirectory(path.dirname(file));
    } finally {
      await fs.unlink(temporary).catch((e) => {
        if (e.code !== 'ENOENT') throw e;
      });
    }
  }
  async verify(root: string, repair = false) {
    const db = await backupDatabase(
      path.join(root, 'db/database.sqlite'),
      repair,
    );
    try {
      const repositories = await db.all(
          'SELECT id,host,storage_state,storage_path FROM Repositories ORDER BY id',
        ),
        worktrees = await db.all(
          'SELECT id,repository_id,local_path,lifecycle_state FROM Worktrees ORDER BY id',
        );
      const summary: {
        id: number;
        worktrees: { id: number; head: string }[];
      }[] = [];
      for (const repo of repositories) {
        const relative = repositoryRelative(repo),
          bare = path.join(root, relative);
        const exists = await fs.lstat(bare).catch((e) => {
          if (e.code === 'ENOENT') return null;
          throw e;
        });
        if (!exists) {
          if (repo.storage_state === 'READY') fail('BACKUP_GIT_MISSING');
          continue;
        }
        if (!exists.isDirectory() || exists.isSymbolicLink())
          fail('BACKUP_GIT_INVALID');
        await new RepositoryPathResolver(root).assertSafe(bare);
        await this.safeConfiguration(bare, root);
        // Git alternates can depend on external object stores. Do not silently omit them.
        if (
          await fs
            .lstat(path.join(bare, 'objects/info/alternates'))
            .catch(() => null)
        )
          fail('BACKUP_GIT_ALTERNATES_UNSUPPORTED');
        const admins = await fs
          .opendir(path.join(bare, 'worktrees'))
          .catch((e) => {
            if (e.code === 'ENOENT') return null;
            throw e;
          });
        if (admins)
          for await (const entry of admins) {
            if (!entry.isDirectory() || entry.isSymbolicLink())
              fail('BACKUP_GIT_INVALID');
            await this.safeAdmin(
              bare,
              path.join(bare, 'worktrees', entry.name),
              root,
            );
          }
        await git(['--git-dir', bare, 'fsck', '--full', '--no-dangling'], root);
        const children = worktrees.filter((w) => w.repository_id === repo.id),
          record = {
            id: repo.id,
            worktrees: [] as { id: number; head: string }[],
          };
        if (repair) {
          for (const w of children) {
            const target = path.join(root, worktreeRelative(w));
            if (await fs.lstat(target).catch(() => null)) {
              const admin = await this.registration(bare, target, root);
              await this.writeRegistration(
                path.join(target, '.git'),
                'gitdir: ' + path.relative(target, admin) + '\n',
              );
              await this.writeRegistration(
                path.join(admin, 'gitdir'),
                path.join(target, '.git') + '\n',
              );
              await git(
                ['--git-dir', bare, 'worktree', 'repair', target],
                root,
              );
            }
          }
          await db.all('UPDATE Repositories SET storage_path=? WHERE id=?', [
            bare,
            repo.id,
          ]);
        }
        for (const w of children) {
          const target = path.join(root, worktreeRelative(w)),
            present = await fs.lstat(target).catch((e) => {
              if (e.code === 'ENOENT') return null;
              throw e;
            });
          if (!present) {
            if (w.lifecycle_state === 'READY') fail('BACKUP_WORKTREE_MISSING');
            continue;
          }
          await new RepositoryPathResolver(root).assertSafe(target);
          if (!present.isDirectory() || present.isSymbolicLink())
            fail('BACKUP_GIT_INVALID');
          if (repair) {
            await db.all('UPDATE Worktrees SET local_path=? WHERE id=?', [
              target,
              w.id,
            ]);
            await git(
              [
                '-C',
                target,
                'status',
                '--porcelain=v1',
                '--untracked-files=no',
                '--ignore-submodules=all',
              ],
              root,
            );
          }
          // Read the copied worktree registration directly before repair; never traverse old .git paths.
          let head: string;
          if (repair)
            head = await git(['-C', target, 'rev-parse', 'HEAD'], root);
          else {
            const admin = await this.registration(bare, target, root);
            head = await git(['--git-dir', admin, 'rev-parse', 'HEAD'], root);
          }
          if (!/^[a-f0-9]{40,64}$/.test(head)) fail('BACKUP_GIT_INVALID');
          record.worktrees.push({ id: w.id, head });
        }
        summary.push(record);
      }
      return summary;
    } finally {
      await db.close();
    }
  }
}
