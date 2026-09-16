import fs from 'fs/promises';
import { constants, createReadStream } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import RuntimePathResolver from './runtimePaths';
import { RuntimeError, runtimeId } from '../shared/runtime';
import { RuntimeLease } from './runtimeProcess';
export type NodeResourceKind =
  | 'runtime'
  | 'toolchain'
  | 'environment'
  | 'build';
export async function nodeFileHash(file: string) {
  const hash = createHash('sha256'),
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    for await (const chunk of handle.createReadStream({ autoClose: false }))
      hash.update(chunk);
    return hash.digest('hex');
  } finally {
    await handle.close();
  }
}
export function nodeHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export default class NodePathResolver extends RuntimePathResolver {
  relative(kind: NodeResourceKind, id: number, environment?: number) {
    runtimeId(id);
    if (kind === 'runtime') return `runtime/node/versions/runtime-${id}`;
    if (kind === 'toolchain')
      return `runtime/node/package-managers/toolchain-${id}`;
    if (kind === 'environment') return `runtime/node/environments/env-${id}`;
    return `runtime/node/environments/env-${runtimeId(
      environment,
    )}/builds/build-${id}`;
  }
  async target(kind: NodeResourceKind, id: number, environment?: number) {
    const relative = this.relative(kind, id, environment);
    return path.join(
      await this.directory(path.posix.dirname(relative), true),
      path.posix.basename(relative),
    );
  }
  async marker(kind: NodeResourceKind, id: number) {
    return path.join(
      await this.directory('runtime/node/ownership', true),
      `${kind}-${runtimeId(id)}.json`,
    );
  }
  async own(
    kind: NodeResourceKind,
    id: number,
    target: string,
    environment?: number,
  ) {
    const stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new RuntimeError('NODE_PATH_INVALID');
    await this.privateWrite(
      await this.marker(kind, id),
      JSON.stringify({
        owner: 'platform-node',
        kind,
        id,
        environment: environment ?? null,
        dev: stat.dev,
        ino: stat.ino,
      }),
    );
  }
  async create(kind: NodeResourceKind, id: number, environment?: number) {
    const target = await this.target(kind, id, environment);
    try {
      await fs.mkdir(target, { mode: 0o700 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST')
        throw new RuntimeError('NODE_RECOVERY_REQUIRED');
      throw e;
    }
    await this.own(kind, id, target, environment);
    return target;
  }
  async assertOwned(kind: NodeResourceKind, id: number, environment?: number) {
    const target = await this.directory(this.relative(kind, id, environment));
    const marker = await this.readJson(await this.marker(kind, id)),
      stat = await fs.lstat(target);
    if (
      marker.owner !== 'platform-node' ||
      marker.kind !== kind ||
      marker.id !== id ||
      marker.environment !== (environment ?? null) ||
      marker.dev !== stat.dev ||
      marker.ino !== stat.ino
    )
      throw new RuntimeError('NODE_PATH_INVALID');
    return target;
  }
  async remove(kind: NodeResourceKind, id: number, environment?: number) {
    const target = await this.target(kind, id, environment);
    try {
      await fs.lstat(target);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      try {
        const m = await this.readJson(await this.marker(kind, id));
        if (
          m.owner !== 'platform-node' ||
          m.id !== id ||
          m.kind !== kind ||
          m.environment !== (environment ?? null)
        )
          throw new RuntimeError('NODE_PATH_INVALID');
        await fs.unlink(await this.marker(kind, id));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      return;
    }
    await this.assertOwned(kind, id, environment);
    if (kind === 'environment') {
      const entries = await fs.readdir(target);
      if (entries.some((x) => x !== 'builds'))
        throw new RuntimeError('NODE_ORPHAN');
      if (entries.includes('builds'))
        await fs.rmdir(
          await this.directory(this.relative(kind, id) + '/builds'),
        );
      await fs.rmdir(target);
    } else await fs.rm(target, { recursive: true });
    await fs.unlink(await this.marker(kind, id));
  }
  async file(root: string, relative: string) {
    if (
      !relative ||
      path.isAbsolute(relative) ||
      relative
        .split('/')
        .some((x) => !x || x === '.' || x === '..' || /[\\\0]/.test(x))
    )
      throw new RuntimeError('NODE_PATH_INVALID');
    const canonical = await fs.realpath(path.join(root, relative));
    if (!canonical.startsWith(root + path.sep))
      throw new RuntimeError('NODE_PATH_INVALID');
    await this.directory(
      path
        .relative(await this.root(), path.dirname(canonical))
        .split(path.sep)
        .join('/'),
    );
    const stat = await fs.lstat(canonical);
    if (!stat.isFile() || stat.isSymbolicLink())
      throw new RuntimeError('NODE_PATH_INVALID');
    return canonical;
  }
  async text(root: string, relative: string, limit = 4 * 1024 * 1024) {
    const file = await this.file(root, relative),
      handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if ((await handle.stat()).size > limit)
        throw new RuntimeError('NODE_SNAPSHOT_LIMIT');
      return await handle.readFile('utf8');
    } finally {
      await handle.close();
    }
  }
  async lease(
    kind: string,
    id: number,
    mode: 'shared' | 'exclusive' = 'exclusive',
  ) {
    if (
      ![
        'provider',
        'runtime',
        'toolchain',
        'environment',
        'build',
        'operation',
        'slot',
      ].includes(kind)
    )
      throw new RuntimeError('NODE_LOCK_INVALID');
    class ResourceLock extends RuntimePathResolver {
      async lock(value: number) {
        return path.join(
          await this.directory('.locks', true),
          `node-${kind}-${runtimeId(value)}.lock`,
        );
      }
    }
    return RuntimeLease.acquire(new ResourceLock(this.dataRoot), id, mode);
  }
  async operation(id: number) {
    return this.directory(`tmp/runtime/node/operation-${runtimeId(id)}`, true);
  }
  async buildSlot() {
    for (let slot = 1; slot <= 2; slot++)
      try {
        return await this.lease('slot', slot);
      } catch (e) {
        if (!(e instanceof RuntimeError) || e.error_code !== 'RUNTIME_BUSY')
          throw e;
      }
    throw new RuntimeError('NODE_BUILD_CONCURRENCY_LIMIT');
  }
}
