const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');

function mockModule(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
}

mockModule('../../back/config', {
  __esModule: true,
  default: {
    bakPath: '/tmp',
    blackFileList: [],
    configPath: '/tmp',
    logPath: '/tmp',
    logs: { level: 'info' },
    rootPath: '/tmp',
    scriptPath: '/tmp',
    systemLogPath: '/tmp',
    writePathList: ['/tmp'],
  },
});
mockModule('../../back/shared/i18n', {
  t: (message) => message,
});
mockModule('../../back/config/util', {
  fileExist: async () => false,
  readDir: async () => [],
  readDirs: async () => [],
  removeAnsi: (content) => content,
  rmPath: async () => {},
});
mockModule('../../back/shared/utils', {
  writeFileWithLock: async () => {},
});
for (const service of ['log']) {
  mockModule(`../../back/services/${service}`, {
    __esModule: true,
    default: class {},
  });
}
mockModule('../../back/data/subscription', {
  SubscriptionStatus: { running: 'running' },
  SubscriptionModel: { findOne: async () => null },
});

const deprecatedRoutes = [
  ['log', '/logs/detail'],
];

for (const [moduleName, replacement] of deprecatedRoutes) {
  test(`${moduleName} filename route is removed; detail route is explicitly handled`, () => {
    const app = express.Router();
    require(`../../back/api/${moduleName}`).default(app);
    const router = app.stack.find((layer) => layer.name === 'router').handle;
    const deprecatedRoute = router.stack.find(
      (layer) => layer.route?.path === '/:file',
    );
    assert.equal(deprecatedRoute, undefined);
    assert.ok(router.stack.some(layer => layer.route?.path === '/detail'));
  });
}

test('arbitrary Config editor has no public controller or service',()=>{const fs=require('node:fs');assert.equal(fs.existsSync('back/api/config.ts'),false);assert.equal(fs.existsSync('back/services/config.ts'),false);});

 test('staging editor service is physically retired',()=>{assert.equal(require('node:fs').existsSync('back/services/script.ts'),false);});
