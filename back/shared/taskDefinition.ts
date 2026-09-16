import path from 'path';
import fs from 'fs/promises';
import {
  TaskExecutionSettings,
  TaskRuntimeBinding,
  TaskSource,
  TaskLanguage,
} from '../data/task';

export class TaskDefinitionError extends Error {
  constructor(public error_code: string, public status = 400) {
    super(error_code);
  }
}
export function relativeTaskPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 4096 ||
    /[\x00-\x1f\x7f\\]/.test(value) ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[A-Za-z]:/.test(value) ||
    value.split('/').some((part) => !part || part === '..' || part === '.')
  )
    throw new TaskDefinitionError('TASK_SOURCE_PATH_INVALID');
  return path.posix.normalize(value);
}
export function taskLanguage(entry: string): TaskLanguage {
  const language: Record<string, TaskLanguage> = {
    '.py': 'PYTHON',
    '.js': 'JAVASCRIPT',
    '.mjs': 'JAVASCRIPT',
    '.cjs': 'JAVASCRIPT',
    '.ts': 'TYPESCRIPT',
    '.sh': 'SHELL',
  };
  const selected = language[path.posix.extname(entry)];
  if (!selected) throw new TaskDefinitionError('TASK_LANGUAGE_UNSUPPORTED');
  return selected;
}
export function runtimeKind(language: TaskLanguage) {
  return language === 'PYTHON'
    ? 'PYTHON'
    : language === 'SHELL'
    ? 'SHELL'
    : 'NODE';
}
export function taskSource(
  input: Partial<TaskSource>,
): Omit<TaskSource, 'task_id'> {
  if (
    !input ||
    input.type !== 'WORKTREE_ENTRYPOINT' ||
    !Number.isSafeInteger(input.worktree_id) ||
    input.worktree_id! < 1 ||
    !['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'SHELL'].includes(
      input.language!,
    ) ||
    !['WORKTREE_ROOT', 'ENTRYPOINT_DIR', 'CUSTOM_RELATIVE'].includes(
      input.cwd_mode!,
    )
  )
    throw new TaskDefinitionError('TASK_SOURCE_INVALID');
  const relative_entrypoint = relativeTaskPath(input.relative_entrypoint);
  if (taskLanguage(relative_entrypoint) !== input.language)
    throw new TaskDefinitionError('TASK_LANGUAGE_MISMATCH');
  const cwd_relative_path =
    input.cwd_mode === 'CUSTOM_RELATIVE'
      ? relativeTaskPath(input.cwd_relative_path)
      : null;
  if (input.cwd_mode !== 'CUSTOM_RELATIVE' && input.cwd_relative_path != null)
    throw new TaskDefinitionError('TASK_CWD_INVALID');
  return {
    type: 'WORKTREE_ENTRYPOINT',
    worktree_id: input.worktree_id!,
    relative_entrypoint,
    language: input.language!,
    cwd_mode: input.cwd_mode!,
    cwd_relative_path,
  };
}
export async function validateTaskSourceFiles(
  root: string,
  source: Pick<
    TaskSource,
    'relative_entrypoint' | 'cwd_mode' | 'cwd_relative_path'
  >,
) {
  // Reject every symlink, including internal symlinks. Do not open special files.
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
    throw new TaskDefinitionError('TASK_WORKTREE_UNSAFE');
  const inspect = async (relative: string, directory: boolean) => {
    const segments = relativeTaskPath(relative).split('/');
    let current = root;
    for (let index = 0; index < segments.length; index++) {
      current = path.join(current, segments[index]);
      const stat = await fs.lstat(current);
      if (
        stat.isSymbolicLink() ||
        (index < segments.length - 1 || directory
          ? !stat.isDirectory()
          : !stat.isFile())
      )
        throw new TaskDefinitionError('TASK_SOURCE_UNSAFE');
    }
  };
  await inspect(source.relative_entrypoint, false);
  if (source.cwd_mode === 'CUSTOM_RELATIVE')
    await inspect(source.cwd_relative_path!, true);
}
export function taskRuntime(
  input: Partial<TaskRuntimeBinding>,
  language: TaskLanguage,
): Omit<TaskRuntimeBinding, 'task_id'> {
  if (!input || input.kind !== runtimeKind(language))
    throw new TaskDefinitionError('TASK_RUNTIME_KIND_MISMATCH');
  const python = input.python_environment_id ?? null,
    node = input.node_environment_id ?? null;
  if (
    [python, node].some(
      (id) => id !== null && (!Number.isSafeInteger(id) || id < 1),
    ) ||
    (input.kind === 'SHELL' && (python !== null || node !== null)) ||
    (input.kind === 'PYTHON' && node !== null) ||
    (input.kind === 'NODE' && python !== null)
  )
    throw new TaskDefinitionError('TASK_RUNTIME_BINDING_INVALID');
  return {
    kind: input.kind,
    python_environment_id: python,
    node_environment_id: node,
  };
}
export function taskArguments(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 256 ||
    value.some(
      (arg) =>
        typeof arg !== 'string' ||
        arg.includes('\0') ||
        Buffer.byteLength(arg) > 8192,
    ) ||
    Buffer.byteLength(JSON.stringify(value)) > 65536
  )
    throw new TaskDefinitionError('TASK_ARGUMENTS_INVALID');
  return [...value];
}
export const DEFAULT_TASK_SETTINGS: Omit<TaskExecutionSettings, 'task_id'> = {
  timeout_seconds: null,
  max_attempts: 1,
  initial_delay_seconds: 0,
  backoff: 'FIXED',
  concurrency: 'FORBID',
  notification: 'NONE',
};
export function taskSettings(
  input: Partial<TaskExecutionSettings>,
): Omit<TaskExecutionSettings, 'task_id'> {
  const value = { ...DEFAULT_TASK_SETTINGS, ...input };
  if (
    (value.timeout_seconds !== null &&
      (!Number.isSafeInteger(value.timeout_seconds) ||
        value.timeout_seconds < 1 ||
        value.timeout_seconds > 86400)) ||
    !Number.isSafeInteger(value.max_attempts) ||
    value.max_attempts < 1 ||
    value.max_attempts > 10 ||
    !Number.isSafeInteger(value.initial_delay_seconds) ||
    value.initial_delay_seconds < 0 ||
    value.initial_delay_seconds > 3600 ||
    !['FIXED', 'EXPONENTIAL'].includes(value.backoff) ||
    !['FORBID', 'QUEUE', 'ALLOW'].includes(value.concurrency) ||
    !['NONE', 'FAILURE', 'SUCCESS', 'ALWAYS'].includes(value.notification)
  )
    throw new TaskDefinitionError('TASK_SETTINGS_INVALID');
  return {
    timeout_seconds: value.timeout_seconds,
    max_attempts: value.max_attempts,
    initial_delay_seconds: value.initial_delay_seconds,
    backoff: value.backoff,
    concurrency: value.concurrency,
    notification: value.notification,
  };
}
