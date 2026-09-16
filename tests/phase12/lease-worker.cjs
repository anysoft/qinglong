require('reflect-metadata');
const path = require('node:path');
const configFile = require.resolve('../../static/build/config');
require.cache[configFile] = {
  id: configFile,
  filename: configFile,
  loaded: true,
  exports: {
    __esModule: true,
    default: { rootPath: process.cwd(), dataPath: process.env.QL_DATA_DIR },
  },
};
(async () => {
  if (process.argv[2] === 'backup') {
    const {
      PlatformBackupBarrier,
    } = require('../../static/build/services/backup/barrier');
    const gate = new PlatformBackupBarrier(process.argv[3]);
    await gate.snapshot(
      async () => true,
      async () => {
        process.stdout.write('HELD\n');
        await new Promise((r) => process.stdin.once('data', r));
      },
    );
  } else {
    const {
        WorkspaceLocks,
      } = require('../../static/build/services/workspaceLocks'),
      {
        RepositoryPathResolver,
      } = require('../../static/build/shared/workspacePaths');
    const {
      PlatformBackupBarrier,
    } = require('../../static/build/services/backup/barrier');
    const control =
      require('node:fs').realpathSync(process.argv[3]) + '.platform-control';
    require('node:fs').mkdirSync(control, { recursive: true, mode: 0o700 });
    await new PlatformBackupBarrier(control).mutation(async () => {
      const lock = await new WorkspaceLocks(
        new RepositoryPathResolver(process.argv[3]),
        path.resolve('shell/git_workspace_lock.py'),
      ).acquire([{ kind: 'worktree', id: Number(process.argv[4]) }], {
        owner_type: process.argv[2],
        owner_id: String(process.pid),
        operation: process.argv[2],
      });
      process.stdout.write('HELD\n');
      await new Promise((r) => process.stdin.once('data', r));
      await lock.release();
    });
  }
})().then(
  () => process.exit(),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
