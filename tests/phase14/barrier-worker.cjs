const path = require('node:path');
process.env.TS_NODE_PROJECT = path.resolve('back/tsconfig.json');
require('ts-node/register/transpile-only');
const configFile = require.resolve('../../back/config/index.ts');
require.cache[configFile] = {
  id: configFile,
  filename: configFile,
  loaded: true,
  exports: {
    __esModule: true,
    default: { rootPath: path.resolve(), dataPath: '' },
  },
};
const {
  PlatformBackupBarrier,
} = require('../../back/services/backup/barrier.ts');
const gate = new PlatformBackupBarrier(process.argv[2]);
gate
  .snapshot(
    async () => true,
    async () => {
      process.send('locked');
      await new Promise(() => {
        setInterval(() => {}, 1000);
      });
    },
  )
  .catch(() => process.exit(1));
