import path from 'path';
import RuntimePathResolver from './runtimePaths';
import { RUNTIME_TOOL_PATH, RuntimeError } from '../shared/runtime';
export default async function runtimeBuildEnvironment(
  paths: RuntimePathResolver,
  operation: number,
  jobs = 4,
  provider = 1,
) {
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 16)
    throw new RuntimeError('RUNTIME_REQUEST_INVALID', 400);
  const directory = await paths.operation(operation);
  const home = await paths.directory(
    `tmp/runtime/python/operation-${operation}/home`,
    true,
  );
  const temporary = await paths.directory(
    `tmp/runtime/python/operation-${operation}/tmp`,
    true,
  );
  const providerRoot = await paths.provider(false, provider);
  const environment: NodeJS.ProcessEnv = {
    PATH: RUNTIME_TOOL_PATH,
    HOME: home,
    TMPDIR: temporary,
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PYENV_ROOT: providerRoot,
    PYTHONNOUSERSITE: '1',
    PYTHON_BUILD_CACHE_PATH: await paths.cache(),
    PYTHON_BUILD_BUILD_PATH: path.join(directory, 'build'),
    // python-build receives only this isolated environment, not Docker's ENV.
    // Bound retries for interrupted downloads without disabling TLS validation.
    PYTHON_BUILD_CURL_OPTS:
      '--http1.1 --retry 5 --retry-all-errors --connect-timeout 30 --max-time 300 --retry-max-time 900',
    MAKE_OPTS: `-j${jobs}`,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
    GIT_ALLOW_PROTOCOL: 'https',
    GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'core.hooksPath',
    GIT_CONFIG_VALUE_1: '/dev/null',
  };
  return { directory, home, environment };
}
