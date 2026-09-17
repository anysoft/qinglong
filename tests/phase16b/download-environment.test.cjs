const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

test('Python download policy reaches a child while host secrets stay excluded', async () => {
  const buildEnvironment = require('../../back/services/runtimeBuildEnvironment').default;
  const paths = {
    operation: async () => '/tmp/platform-download-test',
    directory: async relative => '/tmp/platform-download-test/' + relative,
    provider: async () => '/tmp/platform-download-test/provider',
    cache: async () => '/tmp/platform-download-test/cache',
  };
  const previous = process.env.PYTHON_BUILD_CURL_OPTS;
  process.env.PYTHON_BUILD_CURL_OPTS = '--insecure';
  try {
    const { environment } = await buildEnvironment(paths, 1, 2);
    const output = JSON.parse(execFileSync(process.execPath,
      ['-e', 'console.log(JSON.stringify(process.env))'], { env: environment, encoding: 'utf8' }));
    assert.match(output.PYTHON_BUILD_CURL_OPTS, /--http1\.1/);
    assert.match(output.PYTHON_BUILD_CURL_OPTS, /--retry 5/);
    assert.match(output.PYTHON_BUILD_CURL_OPTS, /--retry-max-time 900/);
    assert.doesNotMatch(output.PYTHON_BUILD_CURL_OPTS, /--insecure/);
    for (const key of ['JWT_SECRET', 'NODE_OPTIONS', 'PYTHONPATH', 'PYTHONHOME'])
      assert.equal(output[key], undefined);
  } finally {
    if (previous === undefined) delete process.env.PYTHON_BUILD_CURL_OPTS;
    else process.env.PYTHON_BUILD_CURL_OPTS = previous;
  }
});
