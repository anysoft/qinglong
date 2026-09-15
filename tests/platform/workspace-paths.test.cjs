const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const load = require('../../test/helpers/load-security-module.cjs');
const { Sequelize } = require('sequelize');
test('managed paths use IDs, reject traversal, symlink escape and case collisions', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ql-path2-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const { RepositoryPathResolver } = load('back/shared/workspacePaths.ts');
  const paths = new RepositoryPathResolver(root);
  const a = await paths.repository({
      id: 1,
      host: 'git.example',
      path: 'Team/Repo',
    }),
    b = await paths.repository({
      id: 2,
      host: 'git.example',
      path: 'team/repo',
    });
  assert.notEqual(a, b);
  assert.match(a, /repository-1\.git$/);
  const wt = await paths.worktree(1, 12);
  assert.match(wt, /repository-1\/wt-12$/);
  await assert.rejects(paths.worktree(1, '../escape'));
  await fs.symlink(os.tmpdir(), path.join(root, 'worktrees/repository-1'));
  await assert.rejects(paths.worktree(1, 13), /PATH_CONFLICT/);
});
