import fs from 'fs/promises';
import path from 'path';
import { Service } from 'typedi';
import config from '../config';
import { ResolvedTaskEnvironment } from './taskEnvironmentResolver';
import { ScopedEnvironmentError } from '../shared/scopedEnv';

@Service()
export default class ExecutionEnvironmentTransport {
  private root = path.join(config.rootPath, '.tmp/task-env');
  async cleanupStale() {
    const temporaryRoot = path.dirname(this.root);
    await fs.mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
    const temporaryStat = await fs.lstat(temporaryRoot);
    if (!temporaryStat.isDirectory() || temporaryStat.isSymbolicLink()) throw new ScopedEnvironmentError('ENV_SNAPSHOT_FAILED');
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new ScopedEnvironmentError('ENV_SNAPSHOT_FAILED');
    await fs.chmod(this.root, 0o700);
    for (const entry of await fs.readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^run-[A-Za-z0-9]+$/.test(entry.name)) continue;
      const dir = path.join(this.root, entry.name);
      try {
        const stat = await fs.stat(dir);
        if (Date.now() - stat.mtimeMs < 60 * 60 * 1000) continue;
        const owner = JSON.parse(await fs.readFile(path.join(dir, 'owner.json'), 'utf8'));
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) continue;
        try { process.kill(owner.pid, 0); } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') await fs.rm(dir, { recursive: true, force: true });
        }
      } catch { /* Unknown entries are never removed. */ }
    }
  }
  async prepare(resolved: ResolvedTaskEnvironment, ownerPid: number) {
    // Conservative portable budget leaves room for task.sh's bookkeeping and argv.
    const environmentBytes = Object.entries(resolved.variables).reduce((size, [name, value]) => size + Buffer.byteLength(name) + Buffer.byteLength(value) + 2, 0);
    if (environmentBytes > 128 * 1024) throw new ScopedEnvironmentError('ENVIRONMENT_TOO_LARGE');
    if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new ScopedEnvironmentError('ENV_SNAPSHOT_FAILED');
    let directory: string | undefined;
    try {
      await this.cleanupStale();
      directory = await fs.mkdtemp(path.join(this.root, 'run-'));
      await fs.chmod(directory, 0o700);
      const write = (name: string, body: string) => fs.writeFile(path.join(directory!, name), body, { mode: 0o600, flag: 'wx' });
      await write('owner.json', JSON.stringify({ pid: ownerPid, created_at: new Date().toISOString() }));
      await write('snapshot.json', JSON.stringify({ variables: resolved.variables, unset: resolved.unsetVariables, secretNames: resolved.secretNames, metadata: resolved.metadata }));
      const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
      const shell = [
        ...resolved.unsetVariables.map(name => `unset ${name}`),
        ...Object.entries(resolved.variables).map(([name, value]) => `export ${name}=${quote(value)}`),
      ].join('\n') + '\n';
      await write('environment.sh', shell);
      return { directory, cleanup: () => fs.rm(directory!, { recursive: true, force: true }) };
    } catch {
      if (directory) await fs.rm(directory, { recursive: true, force: true });
      throw new ScopedEnvironmentError('ENV_SNAPSHOT_FAILED');
    }
  }
}
