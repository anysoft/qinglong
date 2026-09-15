import { createHash } from 'crypto';
import { DesiredPackage, ResolvedPackage } from '../data/pythonEnvironment';
import { RuntimeError } from '../shared/runtime';
import { ProviderContext } from './pyenvProvider';
import PythonEnvironmentPathResolver from './pythonEnvironmentPaths';
/** An index is a server-owned policy. HTTP loopback is only available via constructor injection in tests. */
export default class PipPackageManager {
  constructor(
    readonly paths: PythonEnvironmentPathResolver,
    readonly index = 'https://pypi.org/simple',
  ) {}
  async run(
    ctx: ProviderContext,
    python: string,
    args: string[],
    capture = false,
  ) {
    const environment = {
      ...ctx.environment,
      PIP_CONFIG_FILE: '/dev/null',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      PIP_NO_INPUT: '1',
      PIP_REQUIRE_VIRTUALENV: 'true',
      PIP_CACHE_DIR: await this.paths.cache(),
      PYTHONDONTWRITEBYTECODE: '1',
    };
    return ctx.command.run(
      python,
      [
        '-I',
        '-B',
        '-m',
        'pip',
        '--disable-pip-version-check',
        '--no-input',
        '--cache-dir',
        await this.paths.cache(),
        ...args,
      ],
      ctx.directory,
      environment,
      capture,
    );
  }
  async install(
    ctx: ProviderContext,
    python: string,
    dependencies: DesiredPackage[],
  ) {
    if (!dependencies.length) return;
    try {
      await this.run(ctx, python, [
        'install',
        '--verbose',
        '--index-url',
        this.index,
        '--',
        ...dependencies.map((x) => x.requirement),
      ]);
    } catch (error) {
      if (
        error instanceof RuntimeError &&
        error.error_code === 'RUNTIME_COMMAND_FAILED'
      )
        throw new RuntimeError('DEPENDENCY_BUILD_FAILED', 409, error.exit_code);
      throw error;
    }
  }
  async snapshot(
    ctx: ProviderContext,
    python: string,
    dependencies: DesiredPackage[],
  ) {
    const list = JSON.parse(
      await this.run(ctx, python, ['list', '--format=json'], true),
    );
    if (!Array.isArray(list) || list.length > 10000)
      throw new RuntimeError('PYTHON_ENV_METADATA_INVALID');
    const names = new Set(dependencies.map((x) => x.normalized_name));
    const resolved: ResolvedPackage[] = list
      .map((x) => {
        if (
          typeof x.name !== 'string' ||
          typeof x.version !== 'string' ||
          x.name.length > 255 ||
          x.version.length > 255 ||
          /[\r\n\0]/.test(x.name + x.version)
        )
          throw new RuntimeError('PYTHON_ENV_METADATA_INVALID');
        return {
          name: x.name.toLowerCase().replace(/[-_.]+/g, '-'),
          version: x.version,
          direct: names.has(x.name.toLowerCase().replace(/[-_.]+/g, '-')),
          source_index: this.index,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    const freeze = await this.run(ctx, python, ['freeze', '--all'], true);
    await this.run(ctx, python, ['check']);
    return {
      resolved,
      freeze,
      resolved_hash: createHash('sha256')
        .update(JSON.stringify(resolved))
        .digest('hex'),
    };
  }
}
