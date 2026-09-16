import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import RuntimePathResolver from './runtimePaths';
import { RuntimeLease } from './runtimeProcess';
import { RuntimeError, runtimeId } from '../shared/runtime';
import { PythonEnvironmentBuild } from '../data/pythonEnvironment';
import { RuntimeInstallation } from '../data/runtime';

class EnvironmentLockPaths extends RuntimePathResolver {
  constructor(root: string, private kind: 'environment' | 'build') {
    super(root);
  }
  async lock(id: number) {
    return path.join(
      await this.directory('.locks', true),
      `python-${this.kind}-${runtimeId(id)}.lock`,
    );
  }
}
/** IDs alone determine paths. Sidecars outlive partial removal; unknown roots fail closed. */
export default class PythonEnvironmentPathResolver {
  constructor(readonly runtime = new RuntimePathResolver()) {}
  relative(environment: number) {
    return `runtime/python/environments/env-${runtimeId(environment)}`;
  }
  async lock(
    id: number,
    kind: 'environment' | 'build',
    mode: 'exclusive' | 'shared' = 'exclusive',
  ) {
    try {
      return await RuntimeLease.acquire(
        new EnvironmentLockPaths(this.runtime.dataRoot, kind),
        id,
        mode,
      );
    } catch (error) {
      if (error instanceof RuntimeError && error.error_code === 'RUNTIME_BUSY')
        throw new RuntimeError('PYTHON_ENV_BUSY');
      throw error;
    }
  }
  async environment(id: number, create = false) {
    const relative = this.relative(id);
    const parent = await this.runtime.directory(
      'runtime/python/environments',
      true,
    );
    const root = path.join(parent, `env-${id}`),
      marker = path.join(parent, `env-${id}.json`);
    if (create) {
      let fresh = false;
      try {
        await fs.mkdir(root, { mode: 0o700 });
        fresh = true;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
      if (fresh) {
        const stat = await fs.lstat(root);
        await this.runtime.privateWrite(
          marker,
          JSON.stringify({
            owner: 'python-environment',
            environment_id: id,
            dev: stat.dev,
            ino: stat.ino,
          }),
        );
      }
    }
    await this.runtime.directory(relative);
    const owner = await this.runtime.readJson(marker),
      stat = await fs.lstat(root);
    if (
      owner.owner !== 'python-environment' ||
      owner.environment_id !== id ||
      owner.dev !== stat.dev ||
      owner.ino !== stat.ino
    )
      throw new RuntimeError('PYTHON_ENV_OWNERSHIP_INVALID');
    return root;
  }
  async build(build: PythonEnvironmentBuild, create = false) {
    await this.environment(build.environment_id, create);
    const parent = await this.runtime.directory(
      this.relative(build.environment_id) + '/builds',
      create,
    );
    const root = path.join(parent, `build-${runtimeId(build.id)}`);
    const marker = path.join(
      await this.runtime.directory(
        this.relative(build.environment_id) + '/metadata',
        create,
      ),
      `build-${build.id}.json`,
    );
    if (create) {
      try {
        await fs.mkdir(root, { mode: 0o700 });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST')
          throw new RuntimeError('PYTHON_ENV_RECOVERY_REQUIRED');
        throw e;
      }
      const stat = await fs.lstat(root);
      await this.runtime.privateWrite(
        marker,
        JSON.stringify({
          owner: 'python-environment-build',
          environment_id: build.environment_id,
          build_id: build.id,
          runtime_id: build.runtime_id,
          dev: stat.dev,
          ino: stat.ino,
        }),
      );
    }
    await this.runtime.directory(
      this.relative(build.environment_id) + `/builds/build-${build.id}`,
    );
    const owner = await this.runtime.readJson(marker),
      stat = await fs.lstat(root);
    if (
      owner.owner !== 'python-environment-build' ||
      owner.environment_id !== build.environment_id ||
      owner.build_id !== build.id ||
      owner.runtime_id !== build.runtime_id ||
      owner.dev !== stat.dev ||
      owner.ino !== stat.ino
    )
      throw new RuntimeError('PYTHON_ENV_OWNERSHIP_INVALID');
    return { root, marker, venv: path.join(root, 'venv') };
  }
  async executable(
    build: PythonEnvironmentBuild,
    runtime: RuntimeInstallation,
  ) {
    const location = await this.build(build),
      base = await this.runtime.executable(
        runtime.version,
        runtime.id,
        runtime.provider_id,
      );
    await this.runtime.directory(
      this.relative(build.environment_id) +
        `/builds/build-${build.id}/venv/bin`,
    );
    const executable = path.join(location.venv, 'bin/python');
    if ((await fs.realpath(executable)) !== base.executable)
      throw new RuntimeError('PYTHON_ENV_INVALID');
    const cfg = path.join(location.venv, 'pyvenv.cfg'),
      stat = await fs.lstat(cfg);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384)
      throw new RuntimeError('PYTHON_ENV_INVALID');
    const config = await fs.readFile(cfg, 'utf8');
    if (!/^include-system-site-packages\s*=\s*false\s*$/m.test(config))
      throw new RuntimeError('PYTHON_ENV_INVALID');
    const configHash = createHash('sha256').update(config).digest('hex');
    if (build.state === 'READY' && build.metadata.config_hash !== configHash)
      throw new RuntimeError('PYTHON_ENV_INVALID');
    return { ...location, executable, base, configHash };
  }
  async removeBuild(build: PythonEnvironmentBuild) {
    try {
      const location = await this.build(build);
      await fs.rm(location.root, { recursive: true, force: false });
      await fs.rm(location.marker);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      // An absent directory is removable, but an existing unowned directory is not.
      const root = path.join(
        await this.runtime.root(),
        this.relative(build.environment_id),
        `builds/build-${build.id}`,
      );
      try {
        await fs.lstat(root);
        throw new RuntimeError('PYTHON_ENV_OWNERSHIP_INVALID');
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      const marker = path.join(
        await this.runtime.root(),
        this.relative(build.environment_id),
        `metadata/build-${build.id}.json`,
      );
      try {
        const owner = await this.runtime.readJson(marker);
        if (
          owner.owner !== 'python-environment-build' ||
          owner.build_id !== build.id ||
          owner.environment_id !== build.environment_id ||
          owner.runtime_id !== build.runtime_id
        )
          throw new RuntimeError('PYTHON_ENV_OWNERSHIP_INVALID');
        await fs.rm(marker);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
  }
  async removeEnvironment(id: number) {
    let root: string;
    try {
      root = await this.environment(id);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        const target = path.join(await this.runtime.root(), this.relative(id));
        try {
          await fs.lstat(target);
          throw new RuntimeError('PYTHON_ENV_OWNERSHIP_INVALID');
        } catch (x) {
          if ((x as NodeJS.ErrnoException).code !== 'ENOENT') throw x;
        }
        return;
      }
      throw e;
    }
    for (const entry of await fs.readdir(root)) {
      if (!['builds', 'metadata'].includes(entry))
        throw new RuntimeError('PYTHON_ENV_ORPHAN');
      const dir = await this.runtime.directory(this.relative(id) + '/' + entry);
      if ((await fs.readdir(dir)).length)
        throw new RuntimeError('PYTHON_ENV_ORPHAN');
      await fs.rmdir(dir);
    }
    await fs.rmdir(root);
    await fs.rm(path.join(path.dirname(root), `env-${id}.json`));
  }
  async cache() {
    return this.runtime.directory('cache/python/pip', true);
  }
}
