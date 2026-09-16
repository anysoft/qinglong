import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { RuntimeInstallation } from '../data/runtime';
import { PythonEnvironmentBuild } from '../data/pythonEnvironment';
import { RuntimeError } from '../shared/runtime';
import { ProviderContext } from './pyenvProvider';
import PythonEnvironmentPathResolver from './pythonEnvironmentPaths';
const diagnostic = `import json,sys,site,sysconfig,platform,pip
print(json.dumps(dict(executable=sys.executable,prefix=sys.prefix,base_prefix=sys.base_prefix,version=platform.python_version(),implementation=platform.python_implementation(),system=platform.system(),arch=platform.machine(),user_site=site.ENABLE_USER_SITE,site_packages=site.getsitepackages(),purelib=sysconfig.get_path('purelib'),platlib=sysconfig.get_path('platlib'),pip_file=pip.__file__,pip_version=pip.__version__)))`;
export default class PythonVenvManager {
  constructor(readonly paths: PythonEnvironmentPathResolver) {}
  async create(
    ctx: ProviderContext,
    build: PythonEnvironmentBuild,
    runtime: RuntimeInstallation,
  ) {
    const base = await this.paths.runtime.executable(
      runtime.version,
      runtime.id,
      runtime.provider_id,
    );
    const digest = createHash('sha256')
      .update(await fs.readFile(base.executable))
      .digest('hex');
    if (runtime.metadata.executable_sha256 !== digest)
      throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
    const location = await this.paths.build(build, true);
    await ctx.command.run(
      base.executable,
      ['-I', '-B', '-m', 'venv', '--symlinks', location.venv],
      ctx.directory,
      ctx.environment,
    );
    return this.paths.executable(build, runtime);
  }
  async verify(
    ctx: ProviderContext,
    build: PythonEnvironmentBuild,
    runtime: RuntimeInstallation,
  ) {
    const location = await this.paths.executable(build, runtime);
    if (
      createHash('sha256')
        .update(await fs.readFile(location.base.executable))
        .digest('hex') !== runtime.metadata.executable_sha256
    )
      throw new RuntimeError('PYTHON_ENV_RUNTIME_INVALID');
    const result = JSON.parse(
      await ctx.command.run(
        location.executable,
        ['-I', '-B', '-c', diagnostic],
        ctx.directory,
        ctx.environment,
        true,
      ),
    );
    if (
      path.resolve(result.executable) !== location.executable ||
      (await fs.realpath(result.prefix)) !== location.venv ||
      (await fs.realpath(result.base_prefix)) !== location.base.root ||
      result.version !== runtime.version ||
      result.implementation !== 'CPython' ||
      result.user_site !== false
    )
      throw new RuntimeError('PYTHON_ENV_INVALID');
    for (const target of [
      ...result.site_packages,
      result.purelib,
      result.platlib,
      path.dirname(result.pip_file),
    ]) {
      const real = await fs.realpath(target);
      if (!real.startsWith(location.venv + path.sep))
        throw new RuntimeError('PYTHON_ENV_ISOLATION_INVALID');
      await this.paths.runtime.directory(
        path.relative(await this.paths.runtime.root(), real),
      );
    }
    return {
      ...result,
      config_hash: location.configHash,
      disk_bytes: await this.paths.runtime.diskUsage(location.root),
      verified_at: new Date().toISOString(),
    };
  }
}
