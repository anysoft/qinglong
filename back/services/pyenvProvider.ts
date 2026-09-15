import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import RuntimePathResolver from './runtimePaths';
import { RuntimeCommand } from './runtimeProcess';
import { RuntimeInstallation } from '../data/runtime';
import {
  RuntimeError,
  exactPythonVersion,
  PYENV_RELEASE,
  PYENV_REVISION,
  PYENV_SOURCE,
} from '../shared/runtime';

export interface ProviderContext {
  id: number;
  providerId: number;
  directory: string;
  environment: NodeJS.ProcessEnv;
  command: RuntimeCommand;
  stage: (stage: string) => Promise<void>;
}
export function parsePythonCatalog(output: string) {
  if (Buffer.byteLength(output) > 1024 * 1024)
    throw new RuntimeError('RUNTIME_CATALOG_INVALID');
  const versions = new Set<string>();
  for (const row of output.split(/\r?\n/)) {
    const value = row.trim();
    try {
      versions.add(exactPythonVersion(value));
    } catch {
      /* Other implementations/pre-releases are not installable. */
    }
  }
  if (!versions.size || versions.size > 5000)
    throw new RuntimeError('RUNTIME_CATALOG_INVALID');
  return [...versions].sort((a, b) => {
    const aa = a.split('.').map(Number),
      bb = b.split('.').map(Number);
    return bb[0] - aa[0] || bb[1] - aa[1] || bb[2] - aa[2];
  });
}
const diagnostic =
  'import json,sys,platform; print(json.dumps(dict(executable=sys.executable,version=list(sys.version_info[:3]),version_text=sys.version,prefix=sys.prefix,base_prefix=sys.base_prefix,implementation=platform.python_implementation(),machine=platform.machine(),system=platform.system())))';

/** Trusted, pinned pyenv source; standalone python-build avoids host pyenv hooks/shims. */
export default class PyenvProvider {
  readonly revision = PYENV_REVISION;
  readonly release = PYENV_RELEASE;
  constructor(readonly paths = new RuntimePathResolver()) {}
  async code(ctx: ProviderContext, revision: string) {
    await this.paths.provider(false, ctx.providerId);
    const code = await this.paths.code(revision);
    await this.paths.directory(
      'runtime/python/pyenv/providers/' + revision + '/.git',
    );
    for (const relative of [
      'libexec/pyenv',
      'plugins/python-build/bin/python-build',
    ]) {
      const absolute = path.join(code, relative);
      await this.paths.directory(
        'runtime/python/pyenv/providers/' +
          revision +
          '/' +
          path.dirname(relative),
      );
      const stat = await fs.lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o111))
        throw new RuntimeError('RUNTIME_PROVIDER_INVALID');
    }
    return code;
  }
  async setup(ctx: ProviderContext, repair = false) {
    await ctx.stage('FETCHING_PROVIDER');
    const stage = path.join(ctx.directory, 'provider-stage');
    await fs.mkdir(stage, { mode: 0o700 });
    const git = (args: string[]) =>
      ctx.command.run('git', args, stage, ctx.environment, true);
    await git(['init', '--quiet']);
    await git(['fetch', '--depth=1', PYENV_SOURCE, this.revision]);
    await git(['checkout', '--quiet', '--detach', 'FETCH_HEAD']);
    if ((await git(['rev-parse', 'HEAD'])).trim() !== this.revision)
      throw new RuntimeError('RUNTIME_PROVIDER_INVALID');
    for (const relative of ['.git', 'libexec', 'plugins/python-build/bin']) {
      await this.paths.directory(
        `tmp/runtime/python/operation-${ctx.id}/provider-stage/${relative}`,
      );
    }
    for (const relative of [
      'libexec/pyenv',
      'plugins/python-build/bin/python-build',
    ]) {
      const stat = await fs.lstat(path.join(stage, relative));
      if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o111))
        throw new RuntimeError('RUNTIME_PROVIDER_INVALID');
    }
    const stagedVersion = await ctx.command.run(
      path.join(stage, 'libexec/pyenv'),
      ['--version'],
      ctx.directory,
      ctx.environment,
      true,
    );
    if (!/^pyenv \d+\./.test(stagedVersion.trim()))
      throw new RuntimeError('RUNTIME_PROVIDER_INVALID');
    const target = await this.paths.code(this.revision, true);
    let exists = true;
    try {
      await fs.lstat(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      exists = false;
    }
    if (exists) {
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new RuntimeError('RUNTIME_PATH_INVALID');
      if (!repair) {
        await this.verifyProvider(ctx, this.revision);
        return { revision: this.revision, release: this.release };
      }
      // Only provider code moves; versions and ownership records are siblings.
      const quarantine = await this.paths.quarantine(ctx.id);
      await fs.rename(
        target,
        path.join(quarantine, 'provider-' + this.revision),
      );
    }
    await fs.rename(stage, target);
    await this.verifyProvider(ctx, this.revision);
    return { revision: this.revision, release: this.release };
  }
  async verifyProvider(ctx: ProviderContext, revision: string) {
    const code = await this.code(ctx, revision);
    const head = await ctx.command.run(
      'git',
      [
        '--git-dir=' + path.join(code, '.git'),
        '--work-tree=' + code,
        '-c',
        'core.fsmonitor=false',
        'rev-parse',
        'HEAD',
      ],
      code,
      ctx.environment,
      true,
    );
    if (head.trim() !== revision)
      throw new RuntimeError('RUNTIME_PROVIDER_INVALID');
    const dirty = await ctx.command.run(
      'git',
      [
        '--git-dir=' + path.join(code, '.git'),
        '--work-tree=' + code,
        '-c',
        'core.fsmonitor=false',
        'status',
        '--porcelain',
        '--untracked-files=normal',
      ],
      code,
      ctx.environment,
      true,
    );
    if (dirty.trim()) throw new RuntimeError('RUNTIME_PROVIDER_INVALID');
    const result = await ctx.command.run(
      path.join(code, 'libexec/pyenv'),
      ['--version'],
      ctx.directory,
      ctx.environment,
      true,
    );
    if (!/^pyenv \d+\./.test(result.trim()))
      throw new RuntimeError('RUNTIME_PROVIDER_INVALID');
    return result.trim();
  }
  async catalog(ctx: ProviderContext, revision: string) {
    const code = await this.code(ctx, revision);
    const output = await ctx.command.run(
      path.join(code, 'plugins/python-build/bin/python-build'),
      ['--definitions'],
      ctx.directory,
      ctx.environment,
      true,
    );
    return parsePythonCatalog(output);
  }
  async install(
    ctx: ProviderContext,
    runtime: RuntimeInstallation,
    revision: string,
  ) {
    const code = await this.code(ctx, revision);
    const target = await this.paths.createInstallation(
      runtime.version,
      runtime.id,
      ctx.providerId,
    );
    await ctx.stage('BUILDING');
    await ctx.command.run(
      path.join(code, 'plugins/python-build/bin/python-build'),
      ['-v', exactPythonVersion(runtime.version), target],
      ctx.directory,
      ctx.environment,
    );
    await ctx.stage('VERIFYING');
    return this.verify(ctx, runtime, true);
  }
  async verify(
    ctx: ProviderContext,
    runtime: RuntimeInstallation,
    newInstallation = false,
  ) {
    const { root, executable } = await this.paths.executable(
      runtime.version,
      runtime.id,
      ctx.providerId,
    );
    const handle = await fs.open(
      executable,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let checksum: string;
    try {
      const hash = createHash('sha256');
      for await (const chunk of handle.createReadStream({ autoClose: false }))
        hash.update(chunk);
      checksum = hash.digest('hex');
    } finally {
      await handle.close();
    }
    if (
      !newInstallation &&
      runtime.metadata.executable_sha256 &&
      runtime.metadata.executable_sha256 !== checksum
    )
      throw new RuntimeError('RUNTIME_VERIFY_FAILED');
    let metadata: any;
    try {
      metadata = JSON.parse(
        await ctx.command.run(
          executable,
          ['-I', '-S', '-c', diagnostic],
          ctx.directory,
          ctx.environment,
          true,
        ),
      );
    } catch (error) {
      if (error instanceof RuntimeError) throw error;
      throw new RuntimeError('RUNTIME_VERIFY_FAILED');
    }
    if (
      metadata.implementation !== 'CPython' ||
      !Array.isArray(metadata.version) ||
      metadata.version.join('.') !== runtime.version ||
      typeof metadata.executable !== 'string' ||
      typeof metadata.prefix !== 'string' ||
      typeof metadata.base_prefix !== 'string'
    )
      throw new RuntimeError('RUNTIME_VERIFY_FAILED');
    if (
      (await fs.realpath(metadata.executable)) !== executable ||
      (await fs.realpath(metadata.prefix)) !== root ||
      (await fs.realpath(metadata.base_prefix)) !== root
    )
      throw new RuntimeError('RUNTIME_VERIFY_FAILED');
    return {
      disk_usage_bytes: await this.paths.diskUsage(root),
      version_text: metadata.version_text,
      version: runtime.version,
      implementation: 'CPython',
      platform: metadata.system,
      architecture: metadata.machine,
      executable_sha256: checksum,
    };
  }
  async uninstall(ctx: ProviderContext, runtime: RuntimeInstallation) {
    const target = await this.paths.version(runtime.version, ctx.providerId);
    try {
      await fs.lstat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    await this.paths.assertInstallation(
      runtime.version,
      runtime.id,
      ctx.providerId,
    );
    await fs.rm(target, { recursive: true });
    await fs.rm(await this.paths.ownership(runtime.id), { force: true });
    if (
      await fs.lstat(target).then(
        () => true,
        (error) => {
          if (error.code === 'ENOENT') return false;
          throw error;
        },
      )
    )
      throw new RuntimeError('RUNTIME_REMOVE_FAILED');
  }
  async repair(
    ctx: ProviderContext,
    runtime: RuntimeInstallation,
    revision: string,
  ) {
    const target = await this.paths.version(runtime.version, ctx.providerId);
    let exists = true;
    try {
      await fs.lstat(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      exists = false;
    }
    if (exists) {
      await this.paths.assertInstallation(
        runtime.version,
        runtime.id,
        ctx.providerId,
      );
      const quarantine = await this.paths.quarantine(ctx.id);
      await this.paths.privateWrite(
        path.join(quarantine, 'ownership.json'),
        JSON.stringify(
          await this.paths.readJson(await this.paths.ownership(runtime.id)),
        ),
      );
      await fs.rename(target, path.join(quarantine, 'runtime-' + runtime.id));
    }
    return this.install(ctx, runtime, revision);
  }
}
