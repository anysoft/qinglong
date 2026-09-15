const Module = require('module');
const path = require('path');
const client = require('./client.js');
const scopedEnvironment = require('./scoped-env.js');
scopedEnvironment.apply();

// 注册 ESM loader，使全局安装的包也可通过 import 导入
try {
  Module.register(new URL('esm-loader.mjs', `file://${__dirname}/`).href);
} catch (_) {}

function preferGlobalNodeModules() {
  const { QL_NODE_GLOBAL_PATH } = process.env;
  if (!QL_NODE_GLOBAL_PATH || Module._qlGlobalPathPatched) {
    return;
  }

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (
      !Module.builtinModules.includes(request) &&
      !request.startsWith('node:') &&
      !request.startsWith('.') &&
      !path.isAbsolute(request)
    ) {
      try {
        return originalResolveFilename.call(this, request, parent, isMain, {
          ...options,
          paths: [QL_NODE_GLOBAL_PATH],
        });
      } catch (error) {}
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  Module._qlGlobalPathPatched = true;
}

function expandRange(rangeStr, max) {
  const tempRangeStr = rangeStr
    .trim()
    .replace(/-max/g, `-${max}`)
    .replace(/max-/g, `${max}-`);

  return tempRangeStr.split(' ').flatMap((part) => {
    const rangeMatch = part.match(/^(\d+)([-~_])(\d+)$/);
    if (rangeMatch) {
      const [, start, , end] = rangeMatch.map(Number);
      const step = start < end ? 1 : -1;
      return Array.from(
        { length: Math.abs(end - start) + 1 },
        (_, i) => start + i * step,
      );
    }
    return Number(part);
  });
}

function run() {
  const { envParam, numParam, PREV_NODE_OPTIONS } = process.env;
  process.env.NODE_OPTIONS = PREV_NODE_OPTIONS || '';

  if (envParam && numParam) {
    const array = (process.env[envParam] || '').split('&');
    const runArr = expandRange(numParam, array.length);
    const arrayRun = runArr.map((i) => array[i - 1]);
    const envStr = arrayRun.join('&');
    process.env[envParam] = envStr;
  }
}

try {
  if (!process.argv[1]) {
    return;
  }

  preferGlobalNodeModules();

  process.on('SIGTERM', (code) => {
    process.exit(15);
  });

  run();

  const { sendNotify } = require('./__ql_notify__.js');
  global.QLAPI = {
    notify: sendNotify,
    ...client,
  };
} catch (error) {
  console.log(`run builtin code error: `, error, '\n');
}
