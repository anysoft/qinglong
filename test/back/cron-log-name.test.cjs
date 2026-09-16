const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const loadModule = require('../helpers/load-security-module.cjs');

const { commonCronSchema } = loadModule(
  path.join(__dirname, '../../back/validation/schedule.ts'),
  { '../config': { logPath: '/ql/data/log/' } },
);

// Log naming is retained exclusively in the scheduler/log bridge. Task UI has no log_name editor.
test('bridge API accepts Chinese log names and existing supported names', async () => {
  for (const value of [
    '',
    null,
    undefined,
    '测试',
    '任务_測試-2026.log',
    '分组/每日签到/',
    '𠮷/扩展汉字',
    'legacy_name-123.log',
    'legacy/path/',
    '/ql/data/log/中文日志',
    '/dev/null',
    '中'.repeat(100),
  ]) {
    assert.equal(
      commonCronSchema.log_name.validate(value).error,
      undefined,
      value,
    );
  }
});

test('bridge API still rejects unsafe relative names and excessive length', async () => {
  for (const value of [
    '.',
    '..',
    '../测试',
    '测试/../日志',
    '测试/./日志',
    '测试//日志',
    '测试\\日志',
    '测试 日志',
    '测试;echo',
    '测试$(id)',
    '测试`id`',
    '测试\n日志',
    '测试\0日志',
    '测试😀',
    '中'.repeat(101),
  ]) {
    assert.ok(commonCronSchema.log_name.validate(value).error, value);
  }
});

test('API restricts absolute log paths to the configured directory or /dev/null', () => {
  for (const value of [
    '/tmp/测试',
    '/ql/data/log/../测试',
    '/ql/data/log-other/测试',
  ]) {
    const { error } = commonCronSchema.log_name.validate(value);
    assert.equal(error.details[0].type, 'string.unsafePath', value);
  }
});
