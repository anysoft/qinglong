import { TaskExecutionSettings, TaskLanguage } from '../data/task';
import { TaskHook } from '../data/configAsset';
import { TaskRunStatus } from '../data/taskRun';
import { ResolvedTaskEnvironment } from '../services/taskEnvironmentResolver';
import { ResolvedConfig } from '../services/taskConfig';
import { TaskWorkspace } from '../services/configMaterialization';

export class ExecutionError extends Error {
  readonly error_code = this.code;
  constructor(readonly code: string, readonly status = 409) {
    super(code);
  }
}
export interface ExecutionFailure {
  phase: string;
  code: string;
  hookId?: number;
}
export interface ExecutionResult {
  status: TaskRunStatus;
  taskRunId: number;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  duration: number;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  primaryError: ExecutionFailure | null;
  secondaryErrors: ExecutionFailure[];
  hookResults: Array<{
    hookId: number;
    phase: string;
    code: number;
    reason: string;
  }>;
  cleanupResult: 'PENDING' | 'SUCCESS' | 'RECOVERY_REQUIRED';
}
export interface ExecutionContext {
  identity: {
    taskId: number;
    taskDefinitionVersion: number;
    taskRunId: number;
  };
  source: {
    repositoryId: number;
    worktreeId: number;
    relativeEntrypoint: string;
    absoluteEntrypoint: string;
    language: TaskLanguage;
    cwd: string;
    checksum: string;
  };
  runtime: {
    kind: 'SHELL' | 'PYTHON' | 'NODE';
    executable: string;
    environmentId?: number;
    revisionId?: number;
    buildId?: number;
    runtimeId?: number;
    toolchainId?: number;
    buildRoot?: string;
    nodeModulesRoot?: string;
    venvRoot?: string;
    tsxCli?: string;
    tsxVersion?: string;
    dependencyHash?: string;
  };
  args: readonly string[];
  environmentSnapshot: ResolvedTaskEnvironment;
  configSnapshot: readonly ResolvedConfig[];
  hookSnapshot: readonly TaskHook[];
  settings: Readonly<Omit<TaskExecutionSettings, 'task_id'>>;
  workspace: Readonly<TaskWorkspace>;
  secretValues: readonly string[];
}
/** Only plain snapshot data enters this function. Live leases and redactors stay outside it. */
export function freezeExecutionSnapshot<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) freezeExecutionSnapshot(item);
    Object.freeze(value);
  }
  return value;
}
export function safeExecutionError(
  error: unknown,
  fallback = 'EXECUTION_FAILED',
): string {
  const candidate =
    (error as { code?: unknown; error_code?: unknown })?.error_code ??
    (error as { code?: unknown })?.code;
  return typeof candidate === 'string' &&
    /^[A-Z][A-Z0-9_]{1,95}$/.test(candidate)
    ? candidate
    : fallback;
}
export function executionMetadata(context: ExecutionContext) {
  return {
    task_id: context.identity.taskId,
    task_definition_version: context.identity.taskDefinitionVersion,
    repository_id: context.source.repositoryId,
    worktree_id: context.source.worktreeId,
    source_checksum: context.source.checksum,
    environment_id: context.runtime.environmentId,
    build_id: context.runtime.buildId,
    revision_id: context.runtime.revisionId,
    runtime_id: context.runtime.runtimeId,
    toolchain_id: context.runtime.toolchainId,
    dependency_hash: context.runtime.dependencyHash,
    config_revisions: context.configSnapshot.map((item) => ({
      asset_id: item.asset_id,
      revision_id: item.revision_id,
    })),
    hooks: context.hookSnapshot.map((item) => ({
      id: item.id,
      version: item.version,
    })),
    profile_id: context.environmentSnapshot.profile?.id ?? null,
  };
}

/** Canonical outcomes also exist when a run never reached an Attempt. */
export function terminalExecutionResult(
  taskRunId: number,
  status: TaskRunStatus,
  code: string,
  phase: string,
  startedAt?: Date | string | null,
  attempt = 0,
): ExecutionResult {
  const finished = new Date(),
    started = startedAt ? new Date(startedAt) : finished;
  return {
    status,
    taskRunId,
    attempt,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    duration: Math.max(0, finished.getTime() - started.getTime()),
    exitCode: null,
    signal: null,
    timedOut: status === 'TIMEOUT',
    cancelled: status === 'CANCELLED',
    primaryError: { phase, code },
    secondaryErrors: [],
    hookResults: [],
    cleanupResult:
      status === 'RECOVERY_REQUIRED' ? 'RECOVERY_REQUIRED' : 'SUCCESS',
  };
}
