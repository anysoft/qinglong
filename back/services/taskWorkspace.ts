import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import config from '../config';
import { Crontab } from '../data/cron';
import { TaskWorkspace } from './configMaterialization';
import { ConfigAssetError, safeParents } from '../shared/configAssets';

/** B17: sole mapping from the current scripts execution source into Config Domain. */
export default class TaskWorkspaceResolver {
  async resolve(task: Crontab | null, args: string[]): Promise<TaskWorkspace> {
    const sourceStat = await fs.lstat(config.scriptPath);
    if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink())
      throw new ConfigAssetError('TASK_WORKSPACE_UNSAFE');
    const scripts = await fs.realpath(config.scriptPath);
    const entry = args.find((arg) => /\.(?:js|mjs|ts|py|pyc|sh)$/.test(arg));
    const absolute = entry ? path.resolve(scripts, entry) : null;
    const relative = absolute ? path.relative(scripts, absolute) : '';
    if (
      relative === '..' ||
      relative.startsWith('../') ||
      path.isAbsolute(relative)
    )
      throw new ConfigAssetError('TASK_WORKSPACE_OUTSIDE_SOURCE');
    // No-ID editor executions still share the publication lease of their source.
    const sourceSubscription = /^subscription-([1-9][0-9]*)\//.exec(relative);
    const publicationId =
      task?.sub_id ??
      (sourceSubscription ? Number(sourceSubscription[1]) : undefined);
    const workspaceRoot = publicationId
      ? path.join(scripts, `subscription-${publicationId}`)
      : scripts;
    const workspaceStat = await fs.lstat(workspaceRoot);
    if (!workspaceStat.isDirectory() || workspaceStat.isSymbolicLink())
      throw new ConfigAssetError('TASK_WORKSPACE_UNSAFE');
    let taskDir = workspaceRoot;
    if (absolute) {
      const sourceRelative = path.relative(workspaceRoot, absolute);
      await safeParents(workspaceRoot, sourceRelative);
      const stat = await fs.lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink())
        throw new ConfigAssetError('TASK_SOURCE_UNSAFE');
      taskDir = path.dirname(absolute);
    }
    let cwd = taskDir;
    if (task?.work_dir) {
      cwd = await fs.realpath(path.resolve(scripts, task.work_dir));
      if (!(await fs.stat(cwd)).isDirectory())
        throw new ConfigAssetError('TASK_CWD_INVALID');
    }
    return {
      workspaceRoot,
      taskDir,
      cwd,
      resourceKey: createHash('sha256').update(workspaceRoot).digest('hex'),
      // Current publisher serializes through one global publication lock.
      publicationId: 1,
      ...(!publicationId
        ? { reservedTopLevelPattern: '^subscription-[1-9][0-9]*$' }
        : {}),
    };
  }
  arguments(command: string) {
    return (command.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g) || [])
      .map((x) => (/^['"]/.test(x) ? x.slice(1, -1) : x))
      .filter((x, index) => index !== 0 || x !== 'task');
  }
}
