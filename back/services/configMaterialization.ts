import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import config from '../config';
import ConfigAssetService from './configAsset';
import { ResolvedConfig } from './taskConfig';
import {
  ConfigAssetError,
  privateDirectory,
  safeParents,
  atomicPrivateWrite,
  syncDirectory,
} from '../shared/configAssets';
export interface TaskWorkspace {
  workspaceRoot: string;
  taskDir: string;
  cwd: string;
  resourceKey: string;
  publicationId?: number;
  reservedTopLevelPattern?: string;
}
export interface MaterializationLease {
  resourceKey: string;
  exclusive: boolean;
  assertHeld(): Promise<void>;
}
interface Entry {
  root: string;
  relative: string;
  backup: string;
  copy: string;
  temporary: string;
  original?: { ino: number; dev: number; mode: number; checksum: string };
  installed?: { ino: number; dev: number };
  mode: 'COPY' | 'SYMLINK';
  phase: string;
}
interface Journal {
  version: 1;
  workspace: TaskWorkspace;
  run: string;
  entries: Entry[];
}
const exists = async (file: string) =>
  fs.lstat(file).catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
const checksum = (value: Buffer) =>
  createHash('sha256').update(value).digest('hex');
export default class ConfigMaterializationService {
  readonly root = path.join(config.dataPath, 'tmp', 'config-materialization');
  constructor(private assets = new ConfigAssetService()) {}
  async journalRoot(workspace: TaskWorkspace) {
    if (!/^[a-f0-9]{64}$/.test(workspace.resourceKey))
      throw new ConfigAssetError('CONFIG_WORKSPACE_INVALID');
    await privateDirectory(path.dirname(this.root));
    await privateDirectory(this.root);
    const target = path.join(this.root, workspace.resourceKey);
    await privateDirectory(target);
    return target;
  }
  private async requireLease(
    workspace: TaskWorkspace,
    lease: MaterializationLease,
  ) {
    if (!lease.exclusive || lease.resourceKey !== workspace.resourceKey)
      throw new ConfigAssetError('CONFIG_EXCLUSIVE_LEASE_REQUIRED', 409);
    await lease.assertHeld();
  }
  async recover(workspace: TaskWorkspace, lease: MaterializationLease) {
    const base = await this.journalRoot(workspace);
    for (const entry of await fs.readdir(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^run-[a-f0-9-]{36}$/.test(entry.name))
        continue;
      await this.requireLease(workspace, lease);
      const directory = path.join(base, entry.name),
        file = path.join(directory, 'journal.json');
      const stat = await exists(file);
      if (!stat) {
        if ((await fs.readdir(directory)).length === 0) {
          await fs.rmdir(directory);
          continue;
        }
        throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
        throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      let journal: Journal;
      try {
        journal = JSON.parse(await fs.readFile(file, 'utf8'));
      } catch {
        throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      }
      if (
        journal.version !== 1 ||
        journal.workspace.resourceKey !== workspace.resourceKey ||
        journal.workspace.workspaceRoot !== workspace.workspaceRoot ||
        journal.run !== entry.name ||
        !Array.isArray(journal.entries)
      )
        throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      await this.restore(directory, journal, lease);
    }
  }
  async prepare(
    workspace: TaskWorkspace,
    bindings: ResolvedConfig[],
    lease: MaterializationLease,
  ) {
    await this.requireLease(workspace, lease);
    await this.recover(workspace, lease);
    const base = await this.journalRoot(workspace),
      run = 'run-' + randomUUID(),
      directory = path.join(base, run);
    await fs.mkdir(directory, { mode: 0o700 });
    const journal: Journal = { version: 1, workspace, run, entries: [] };
    const write = () =>
      atomicPrivateWrite(
        path.join(directory, 'journal.json'),
        JSON.stringify(journal),
      );
    await write();
    const targets = new Set<string>();
    try {
      for (const [index, resolved] of bindings.entries()) {
        await lease.assertHeld();
        const binding = resolved.binding,
          root =
            binding.target_base === 'TASK_DIR'
              ? workspace.taskDir
              : workspace.workspaceRoot;
        const relativeToRoot = path.relative(workspace.workspaceRoot, root);
        if (
          relativeToRoot === '..' ||
          relativeToRoot.startsWith('../') ||
          path.isAbsolute(relativeToRoot)
        )
          throw new ConfigAssetError('CONFIG_UNSAFE_PATH');
        await safeParents(
          workspace.workspaceRoot,
          path.join(relativeToRoot, 'placeholder'),
        );
        const logical = path
          .join(relativeToRoot, binding.target_path)
          .split(path.sep)[0];
        if (
          workspace.reservedTopLevelPattern &&
          new RegExp(workspace.reservedTopLevelPattern).test(logical)
        )
          throw new ConfigAssetError('CONFIG_RESERVED_WORKSPACE');
        const target = await safeParents(root, binding.target_path, true);
        if (targets.has(target))
          throw new ConfigAssetError('CONFIG_TARGET_CONFLICT');
        targets.add(target);
        const current = await exists(target);
        if (current && (!current.isFile() || current.isSymbolicLink()))
          throw new ConfigAssetError('CONFIG_TARGET_UNSAFE');
        if (current && binding.conflict_policy !== 'REPLACE_RESTORE')
          throw new ConfigAssetError('CONFIG_TARGET_EXISTS', 409);
        const copy = path.join(directory, `content-${index}`),
          backup = path.join(directory, `backup-${index}`),
          temporary = path.join(
            path.dirname(target),
            `.platform-${run}-${index}`,
          );
        await fs.writeFile(
          copy,
          await this.assets.readRevision(resolved.revision),
          { mode: binding.writable ? 0o600 : 0o400, flag: 'wx' },
        );
        const entry: Entry = {
          root,
          relative: binding.target_path,
          backup,
          copy,
          temporary,
          mode: binding.materialization_mode,
          phase: 'PLANNED',
        };
        if (current)
          entry.original = {
            ino: current.ino,
            dev: current.dev,
            mode: current.mode,
            checksum: checksum(await fs.readFile(target)),
          };
        journal.entries.push(entry);
        await write();
        if (current) {
          await fs.rename(target, backup);
          await syncDirectory(path.dirname(target));
          await syncDirectory(directory);
          entry.phase = 'BACKED_UP';
          await write();
        }
        if (binding.materialization_mode === 'SYMLINK')
          await fs.symlink(copy, temporary);
        else {
          await fs.copyFile(
            copy,
            temporary,
            require('fs').constants.COPYFILE_EXCL,
          );
          await fs.chmod(temporary, binding.writable ? 0o600 : 0o400);
        }
        const staged = await fs.lstat(temporary);
        entry.installed = { ino: staged.ino, dev: staged.dev };
        await write();
        // Recheck parents and unexpected target creation before the atomic install.
        await safeParents(root, binding.target_path);
        if (await exists(target))
          throw new ConfigAssetError('CONFIG_TARGET_CONFLICT');
        if (entry.mode === 'SYMLINK')
          await promisify(execFile)(
            'python3',
            [
              '-I',
              '-S',
              path.join(config.rootPath, 'shell/config_link.py'),
              temporary,
              target,
            ],
            { timeout: 5000 },
          );
        else await fs.link(temporary, target);
        await fs.unlink(temporary);
        await syncDirectory(path.dirname(target));
        entry.phase = 'INSTALLED';
        await write();
      }
      return {
        directory,
        cleanup: () => this.restore(directory, journal, lease),
      };
    } catch (error) {
      try {
        await this.restore(directory, journal, lease);
      } catch {
        throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      }
      throw error instanceof ConfigAssetError
        ? error
        : new ConfigAssetError('CONFIG_MATERIALIZATION_FAILED');
    }
  }
  private async restore(
    directory: string,
    journal: Journal,
    lease: MaterializationLease,
  ) {
    await this.requireLease(journal.workspace, lease);
    for (const [index, entry] of [...journal.entries.entries()].reverse()) {
      if (
        entry.backup !== path.join(directory, `backup-${index}`) ||
        entry.copy !== path.join(directory, `content-${index}`) ||
        !['COPY', 'SYMLINK'].includes(entry.mode) ||
        ![journal.workspace.workspaceRoot, journal.workspace.taskDir].includes(
          entry.root,
        )
      )
        throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      const relativeRoot = path.relative(
        journal.workspace.workspaceRoot,
        entry.root,
      );
      if (
        relativeRoot === '..' ||
        relativeRoot.startsWith('../') ||
        path.isAbsolute(relativeRoot)
      )
        throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      await safeParents(
        journal.workspace.workspaceRoot,
        path.join(relativeRoot, 'placeholder'),
      );
      const target = await safeParents(entry.root, entry.relative);
      if (
        entry.temporary !==
        path.join(path.dirname(target), `.platform-${journal.run}-${index}`)
      )
        throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      const current = await exists(target),
        backup = await exists(entry.backup);
      if (current) {
        const installed =
          entry.installed &&
          current.ino === entry.installed.ino &&
          current.dev === entry.installed.dev;
        const untouched =
          entry.original &&
          current.ino === entry.original.ino &&
          current.dev === entry.original.dev;
        if (installed) {
          if (
            entry.mode === 'SYMLINK' &&
            (!current.isSymbolicLink() ||
              (await fs.readlink(target)) !== entry.copy)
          )
            throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
          await fs.unlink(target);
        } else if (!untouched)
          throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
      }
      if (backup) {
        if (
          !entry.original ||
          !backup.isFile() ||
          backup.isSymbolicLink() ||
          backup.ino !== entry.original.ino ||
          backup.dev !== entry.original.dev ||
          checksum(await fs.readFile(entry.backup)) !== entry.original.checksum
        )
          throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
        const restored = await exists(target);
        if (
          restored &&
          (restored.ino !== backup.ino || restored.dev !== backup.dev)
        )
          throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
        if (!restored) await fs.link(entry.backup, target);
        await fs.unlink(entry.backup);
        await syncDirectory(path.dirname(target));
        await syncDirectory(directory);
      }
      const temporary = await exists(entry.temporary);
      if (temporary) {
        if (
          entry.installed
            ? temporary.ino !== entry.installed.ino ||
              temporary.dev !== entry.installed.dev
            : entry.mode === 'SYMLINK'
            ? !temporary.isSymbolicLink() ||
              (await fs.readlink(entry.temporary)) !== entry.copy
            : !temporary.isFile() ||
              temporary.isSymbolicLink() ||
              checksum(await fs.readFile(entry.temporary)) !==
                checksum(await fs.readFile(entry.copy))
        )
          throw new ConfigAssetError('CONFIG_RECOVERY_REQUIRED', 409);
        await fs.unlink(entry.temporary);
      }
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
}
