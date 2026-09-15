import fs from 'fs/promises';
import { constants } from 'fs';
import os from 'os';
import path from 'path';
import RuntimePathResolver from './runtimePaths';
import { RuntimeError, RUNTIME_TOOL_PATH } from '../shared/runtime';
export default class RuntimeDiagnosticsService {
  constructor(private paths = new RuntimePathResolver()) {}
  async inspect() {
    const root = await this.paths.root();
    const tools = await Promise.all(
      ['git', 'make', 'cc', 'tar', 'curl', 'wget', 'python3'].map(
        async (name) => {
          let available = false;
          for (const directory of RUNTIME_TOOL_PATH.split(':'))
            try {
              await fs.access(path.join(directory, name), constants.X_OK);
              available = true;
              break;
            } catch {}
          return { name, available };
        },
      ),
    );
    const disk = await (
      fs as typeof fs & {
        statfs: (root: string) => Promise<{ bavail: number; bsize: number }>;
      }
    )
      .statfs(root)
      .catch(() => null);
    const available = disk ? Number(disk.bavail) * Number(disk.bsize) : null;
    const writableAt = async (relative: string) => {
      const segments = relative.split('/');
      for (let count = segments.length; count >= 0; count--)
        try {
          const directory = count
            ? await this.paths.directory(segments.slice(0, count).join('/'))
            : root;
          return await fs.access(directory, constants.W_OK).then(
            () => true,
            () => false,
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false;
        }
      return false;
    };
    const writable = await writableAt('runtime/python/pyenv'),
      cacheWritable = await writableAt('cache/runtime/python/downloads');
    const supervisor = await fs.access('/usr/bin/python3', constants.X_OK).then(
      () => true,
      () => false,
    );
    const missing = tools
      .filter((x) => !['curl', 'wget'].includes(x.name) && !x.available)
      .map((x) => x.name);
    if (!supervisor) missing.push('/usr/bin/python3 supervisor');
    if (!cacheWritable) missing.push('writable download cache');
    if (!tools.some((x) => ['curl', 'wget'].includes(x.name) && x.available))
      missing.push('curl or wget');
    return {
      state:
        missing.length || !writable
          ? 'MISSING_REQUIREMENT'
          : available !== null && available < 1024 ** 3
          ? 'WARNING'
          : 'READY',
      host_os: os.type(),
      architecture: os.arch(),
      tools,
      missing_requirements: missing,
      runtime_root: path.join(root, 'runtime/python/pyenv'),
      runtime_root_writable: writable,
      cache_writable: cacheWritable,
      available_disk_bytes: available,
      notes: [
        'Tool presence does not guarantee headers/libraries; build output is authoritative.',
        'The platform does not install OS packages.',
      ],
    };
  }
  async beforeInstall() {
    const result = await this.inspect();
    if (result.missing_requirements.length || !result.runtime_root_writable)
      throw new RuntimeError('BUILD_REQUIREMENT_MISSING');
    if (
      result.available_disk_bytes !== null &&
      result.available_disk_bytes < 512 * 1024 ** 2
    )
      throw new RuntimeError('RUNTIME_DISK_SPACE_LOW');
    return result;
  }
}
