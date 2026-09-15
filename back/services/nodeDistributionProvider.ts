import fs from 'fs/promises';
import path from 'path';
import config from '../config';
import { RuntimeInstallation } from '../data/runtime';
import { RuntimeError } from '../shared/runtime';
import { NodeCatalogEntry } from '../shared/nodeEnvironment';
import { ProviderContext } from './pyenvProvider';
import NodePathResolver, { nodeFileHash } from './nodePaths';
export function exactNodeVersion(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(?:[1-9]\d?)\.(?:0|[1-9]\d{0,2})\.(?:0|[1-9]\d{0,2})$/.test(value)
  )
    throw new RuntimeError('NODE_VERSION_INVALID', 400);
  return value;
}
export function nodePlatform(platform = process.platform, arch = process.arch) {
  if (
    !['linux', 'darwin'].includes(platform) ||
    !['x64', 'arm64'].includes(arch)
  )
    throw new RuntimeError('NODE_RUNTIME_PLATFORM_UNSUPPORTED', 400);
  return `${platform}-${arch}`;
}
export function parseNodeCatalog(raw: string): NodeCatalogEntry[] {
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.length > 10000)
    throw new RuntimeError('NODE_CATALOG_INVALID');
  return rows
    .filter(
      (x) =>
        typeof x.version === 'string' &&
        /^v\d+\.\d+\.\d+$/.test(x.version) &&
        Number(x.version.split('.')[0].slice(1)) >= 18,
    )
    .map((x) => {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(x.date) ||
        !Array.isArray(x.files) ||
        x.files.some((f: unknown) => typeof f !== 'string') ||
        !(x.lts === false || typeof x.lts === 'string')
      )
        throw new RuntimeError('NODE_CATALOG_INVALID');
      return {
        version: exactNodeVersion(x.version.slice(1)),
        date: x.date,
        lts: x.lts,
        files: x.files,
        npm: typeof x.npm === 'string' ? x.npm : null,
      };
    })
    .sort((a, b) => {
      const aa = a.version.split('.').map(Number),
        bb = b.version.split('.').map(Number);
      return bb[0] - aa[0] || bb[1] - aa[1] || bb[2] - aa[2];
    });
}
/** Official binary provider. Source is constructor-injected only for deterministic tests. */
export default class NodeDistributionProvider {
  constructor(
    readonly paths = new NodePathResolver(),
    readonly source = 'https://nodejs.org/dist',
  ) {
    const url = new URL(source);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !(
        source === 'https://nodejs.org/dist' ||
        (url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost'].includes(url.hostname))
      )
    )
      throw new RuntimeError('NODE_SOURCE_INVALID');
  }
  async download(
    ctx: ProviderContext,
    url: string,
    file: string,
    maxBytes: number,
  ) {
    await ctx.command.run(
      '/usr/bin/curl',
      [
        '-q',
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        '--max-redirs',
        '3',
        '--proto',
        this.source.startsWith('https:') ? '=https' : '=http',
        '--proto-redir',
        this.source.startsWith('https:') ? '=https' : '=http',
        '--max-filesize',
        String(maxBytes),
        '--output',
        file,
        url,
      ],
      ctx.directory,
      ctx.environment,
    );
    if ((await fs.lstat(file)).size > maxBytes)
      throw new RuntimeError('NODE_DOWNLOAD_LIMIT');
  }
  async catalog(ctx: ProviderContext) {
    await ctx.stage('REFRESHING_CATALOG');
    const file = path.join(ctx.directory, 'index.json');
    await this.download(
      ctx,
      this.source + '/index.json',
      file,
      4 * 1024 * 1024,
    );
    return parseNodeCatalog(await fs.readFile(file, 'utf8'));
  }
  async verifyAt(
    ctx: ProviderContext,
    runtime: RuntimeInstallation,
    root: string,
    checkHash = true,
  ) {
    const executable = await this.paths.file(root, 'bin/node'),
      hash = await nodeFileHash(executable);
    if (
      checkHash &&
      runtime.metadata.executable_sha256 &&
      runtime.metadata.executable_sha256 !== hash
    )
      throw new RuntimeError('NODE_RUNTIME_CHECKSUM_MISMATCH');
    const result = JSON.parse(
      await ctx.command.run(
        executable,
        [
          '--no-addons',
          '-e',
          'console.log(JSON.stringify({executable:process.execPath,version:process.version,versions:process.versions,platform:process.platform,arch:process.arch}))',
        ],
        root,
        ctx.environment,
        true,
      ),
    );
    if (
      (await fs.realpath(result.executable)) !== executable ||
      result.version !== 'v' + runtime.version ||
      result.platform !== process.platform ||
      result.arch !== process.arch
    )
      throw new RuntimeError('NODE_RUNTIME_IDENTITY_INVALID');
    const npmCli = await this.paths.file(
      root,
      'lib/node_modules/npm/bin/npm-cli.js',
    );
    const npmVersion = (
      await ctx.command.run(
        executable,
        [npmCli, '--version'],
        ctx.directory,
        ctx.environment,
        true,
      )
    ).trim();
    const npmPackage = JSON.parse(
      await this.paths.text(root, 'lib/node_modules/npm/package.json'),
    );
    if (npmVersion !== npmPackage.version)
      throw new RuntimeError('NODE_NPM_INVALID');
    return {
      executable_sha256: hash,
      node_version: runtime.version,
      platform: result.platform,
      architecture: result.arch,
      versions: result.versions,
      npm_version: npmVersion,
      npm_cli_sha256: await nodeFileHash(npmCli),
      corepack: await fs
        .lstat(path.join(root, 'lib/node_modules/corepack/package.json'))
        .then(
          () => true,
          () => false,
        ),
    };
  }
  async verify(ctx: ProviderContext, runtime: RuntimeInstallation) {
    await ctx.stage('VERIFYING_RUNTIME');
    return this.verifyAt(
      ctx,
      runtime,
      await this.paths.assertOwned('runtime', runtime.id),
    );
  }
  async install(
    ctx: ProviderContext,
    runtime: RuntimeInstallation,
    repair = false,
  ) {
    const version = exactNodeVersion(runtime.version),
      platform = nodePlatform(),
      prefix = `node-v${version}-${platform}`,
      artifact = prefix + '.tar.xz';
    const archive = path.join(ctx.directory, 'node.tar.xz'),
      checksums = path.join(ctx.directory, 'SHASUMS256.txt'),
      staging = path.join(ctx.directory, 'distribution');
    await ctx.stage('DOWNLOADING_CHECKSUM');
    await this.download(
      ctx,
      `${this.source}/v${version}/SHASUMS256.txt`,
      checksums,
      1024 * 1024,
    );
    const matches = (await fs.readFile(checksums, 'utf8'))
      .split(/\r?\n/)
      .map((x) => x.match(/^([a-f0-9]{64})\s+\*?(.+)$/))
      .filter((x) => x?.[2] === artifact);
    if (matches.length !== 1)
      throw new RuntimeError('NODE_RUNTIME_ARTIFACT_UNAVAILABLE');
    await ctx.stage('DOWNLOADING_RUNTIME');
    await this.download(
      ctx,
      `${this.source}/v${version}/${artifact}`,
      archive,
      256 * 1024 * 1024,
    );
    const checksum = await nodeFileHash(archive);
    if (checksum !== matches[0]![1])
      throw new RuntimeError('NODE_RUNTIME_CHECKSUM_MISMATCH');
    await ctx.stage('EXTRACTING_RUNTIME');
    try {
      await ctx.command.run(
        '/usr/bin/python3',
        [
          '-I',
          '-S',
          path.join(config.rootPath, 'shell/node_archive.py'),
          archive,
          staging,
          prefix,
        ],
        ctx.directory,
        ctx.environment,
      );
    } catch (e) {
      if (
        e instanceof RuntimeError &&
        e.error_code === 'RUNTIME_COMMAND_FAILED'
      )
        throw new RuntimeError('NODE_ARCHIVE_INVALID');
      throw e;
    }
    await ctx.stage('VERIFYING_STAGING');
    const metadata = await this.verifyAt(ctx, runtime, staging, false);
    const target = await this.paths.target('runtime', runtime.id);
    if (repair) {
      try {
        await fs.lstat(target);
        await this.paths.assertOwned('runtime', runtime.id);
        const quarantine = await this.paths.directory(
          `runtime/node/quarantine/operation-${ctx.id}`,
          true,
        );
        await fs.rename(target, path.join(quarantine, 'runtime'));
        await fs.rename(
          await this.paths.marker('runtime', runtime.id),
          path.join(quarantine, 'ownership.json'),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
    }
    try {
      await fs.lstat(target);
      throw new RuntimeError('NODE_RECOVERY_REQUIRED');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await ctx.stage('PUBLISHING_RUNTIME');
    await fs.rename(staging, target);
    await this.paths.own('runtime', runtime.id, target);
    await this.verify(ctx, { ...runtime, metadata });
    return {
      ...metadata,
      artifact,
      artifact_sha256: checksum,
      checksum_source: `https://nodejs.org/dist/v${version}/SHASUMS256.txt`,
      signature_verified: false,
      distribution_source: this.source,
      installed_at: new Date().toISOString(),
    };
  }
}
