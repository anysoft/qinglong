import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import config from '../config';
import { RuntimeError, runtimeId, exactPythonVersion } from '../shared/runtime';

/** All runtime, operation, log and cache paths stay within this domain boundary. */
export default class RuntimePathResolver {
  constructor(readonly dataRoot = config.dataPath) {}
  async root() {
    const stat = await fs.lstat(this.dataRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new RuntimeError('RUNTIME_PATH_INVALID');
    return fs.realpath(this.dataRoot);
  }
  async directory(relative: string, create = false) {
    const root = await this.root();
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative
        .split('/')
        .some((x) => !x || x === '.' || x === '..' || /[\\\0]/.test(x))
    )
      throw new RuntimeError('RUNTIME_PATH_INVALID');
    let target = root;
    for (const part of relative.split('/')) {
      target = path.join(target, part);
      if (create)
        await fs.mkdir(target, { mode: 0o700 }).catch((e) => {
          if (e.code !== 'EEXIST') throw e;
        });
      const stat = await fs.lstat(target);
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        (process.getuid && stat.uid !== process.getuid())
      )
        throw new RuntimeError('RUNTIME_PATH_INVALID');
    }
    return target;
  }
  async privateWrite(file: string, value: string) {
    const parent = path.dirname(file),
      root = await this.root();
    const relative = path.relative(root, parent).split(path.sep).join('/');
    await this.directory(relative);
    const temporary = path.join(parent, '.write-' + randomUUID());
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
      try {
        await handle.writeFile(value);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, file);
      const dir = await fs.open(parent, 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async readJson(file: string) {
    const root = await this.root();
    await this.directory(
      path.relative(root, path.dirname(file)).split(path.sep).join('/'),
    );
    const handle = await fs.open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 1024 * 1024)
        throw new RuntimeError('RUNTIME_PATH_INVALID');
      return JSON.parse(await handle.readFile('utf8'));
    } finally {
      await handle.close();
    }
  }
  async lock(providerId: number) {
    return path.join(
      await this.directory('.locks', true),
      `runtime-provider-${runtimeId(providerId)}.lock`,
    );
  }
  async provider(create = false, providerId = 1) {
    const relative = 'runtime/python/pyenv';
    let existed = true;
    try {
      await this.directory(relative);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      existed = false;
    }
    const root = await this.directory(relative, create),
      marker = path.join(root, '.runtime-owner.json');
    if (create) {
      let present = true;
      try {
        await fs.lstat(marker);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        present = false;
      }
      if (!present) {
        if (existed && (await fs.readdir(root)).length)
          throw new RuntimeError('RUNTIME_RECOVERY_REQUIRED');
        await this.privateWrite(
          marker,
          JSON.stringify({
            version: 1,
            provider_id: runtimeId(providerId),
            owner: 'platform-runtime',
          }),
        );
      }
    }
    const owner = await this.readJson(marker);
    if (
      owner.version !== 1 ||
      owner.provider_id !== runtimeId(providerId) ||
      owner.owner !== 'platform-runtime'
    )
      throw new RuntimeError('RUNTIME_PATH_INVALID');
    return root;
  }
  async code(revision: string, createParent = false) {
    if (!/^[a-f0-9]{40}$/.test(revision))
      throw new RuntimeError('RUNTIME_PATH_INVALID');
    const parent = await this.directory(
      'runtime/python/pyenv/providers',
      createParent,
    );
    return path.join(parent, revision);
  }
  async version(version: string, providerId = 1) {
    await this.provider(false, providerId);
    return path.join(
      await this.directory('runtime/python/pyenv/versions', true),
      exactPythonVersion(version),
    );
  }
  async assertInstallation(version: string, runtime: number, provider = 1) {
    const target = await this.version(version, provider);
    await this.directory(
      'runtime/python/pyenv/versions/' + exactPythonVersion(version),
    );
    const owner = await this.readJson(await this.ownership(runtime));
    const stat = await fs.lstat(target);
    if (
      owner.runtime_id !== runtimeId(runtime) ||
      owner.provider_id !== runtimeId(provider) ||
      owner.version !== version ||
      owner.dev !== stat.dev ||
      owner.ino !== stat.ino
    )
      throw new RuntimeError('RUNTIME_PATH_INVALID');
    return target;
  }
  async createInstallation(version: string, runtime: number, provider = 1) {
    const target = await this.version(version, provider);
    try {
      await fs.mkdir(target, { mode: 0o700 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST')
        throw new RuntimeError('RUNTIME_RECOVERY_REQUIRED');
      throw e;
    }
    const stat = await fs.lstat(target);
    await this.privateWrite(
      await this.ownership(runtime),
      JSON.stringify({
        runtime_id: runtimeId(runtime),
        provider_id: runtimeId(provider),
        version,
        dev: stat.dev,
        ino: stat.ino,
      }),
    );
    return target;
  }
  async ownership(id: number) {
    return path.join(
      await this.directory('runtime/python/pyenv/ownership', true),
      `runtime-${runtimeId(id)}.json`,
    );
  }
  async executable(version: string, runtime: number, provider = 1) {
    const root = await this.assertInstallation(version, runtime, provider);
    await this.directory('runtime/python/pyenv/versions/' + version + '/bin');
    const executable = await fs.realpath(path.join(root, 'bin/python'));
    if (!executable.startsWith(root + path.sep))
      throw new RuntimeError('RUNTIME_PATH_INVALID');
    const parent = path
      .relative(await this.root(), path.dirname(executable))
      .split(path.sep)
      .join('/');
    await this.directory(parent);
    const stat = await fs.lstat(executable);
    if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o111))
      throw new RuntimeError('RUNTIME_PATH_INVALID');
    return { root, executable, stat };
  }
  async operation(id: number) {
    return this.directory(
      `tmp/runtime/python/operation-${runtimeId(id)}`,
      true,
    );
  }
  async cache() {
    return this.directory('cache/runtime/python/downloads', true);
  }
  async log(id: number) {
    return path.join(
      await this.directory('log/runtime', true),
      `runtime-operation-${runtimeId(id)}.log`,
    );
  }
  async quarantine(id: number) {
    return this.directory(
      `runtime/python/quarantine/operation-${runtimeId(id)}`,
      true,
    );
  }
  async diskUsage(root: string) {
    let bytes = 0,
      entries = 0;
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await fs.readdir(directory, {
        withFileTypes: true,
      })) {
        if (++entries > 250000) throw new RuntimeError('RUNTIME_SCAN_LIMIT');
        const target = path.join(directory, entry.name),
          stat = await fs.lstat(target);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) await visit(target);
        else if (stat.isFile()) bytes += stat.size;
      }
    };
    await visit(root);
    return bytes;
  }
}
