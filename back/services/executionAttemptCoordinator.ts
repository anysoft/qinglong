import {
  ExecutionContext,
  ExecutionResult,
  safeExecutionError,
} from '../shared/execution';
import { RuntimeLease } from './runtimeProcess';
import HookExecutor from './hookExecutor';
import TaskHookLifecycle from './taskHookLifecycle';
import ConfigMaterializationService, {
  MaterializationLease,
} from './configMaterialization';
import ExecutionNodeBinding from './executionNodeBinding';
import ExecutionPaths from './executionPaths';
import ExecutionRedactor from './executionRedactor';
import RunnerV2 from './runnerV2';

export default class ExecutionAttemptCoordinator {
  private lifecycle?: TaskHookLifecycle;
  private cancelled = false;
  private wake?: () => void;
  constructor(private paths = new ExecutionPaths()) {}
  cancel() {
    this.cancelled = true;
    this.lifecycle?.cancel();
    this.wake?.();
  }
  get isCancelled() {
    return this.cancelled;
  }
  async backoff(seconds: number) {
    if (this.cancelled) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
      const timer = setTimeout(finish, seconds * 1000);
      this.wake = finish;
    });
  }
  retry(result: ExecutionResult, context: ExecutionContext) {
    if (
      this.cancelled ||
      result.attempt >= context.settings.max_attempts ||
      result.cleanupResult !== 'SUCCESS'
    )
      return false;
    return (
      result.status === 'TIMEOUT' ||
      (result.status === 'FAILED' &&
        !!result.primaryError &&
        ['EXIT_NONZERO', 'TIMEOUT', 'HOOK_EXECUTION_FAILED'].includes(
          result.primaryError.code,
        ))
    );
  }
  async run(
    context: ExecutionContext,
    attempt: number,
    leases: RuntimeLease[],
    lease: MaterializationLease,
    redactor: ExecutionRedactor,
  ): Promise<ExecutionResult> {
    const started = Date.now();
    const result: ExecutionResult = {
      status: 'RUNNING',
      taskRunId: context.identity.taskRunId,
      attempt,
      startedAt: new Date(started).toISOString(),
      finishedAt: '',
      duration: 0,
      exitCode: null,
      signal: null,
      timedOut: false,
      cancelled: false,
      primaryError: null,
      secondaryErrors: [],
      hookResults: [],
      cleanupResult: 'PENDING',
    };
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const directory = await this.paths.attemptDirectory(
        context.identity.taskRunId,
        attempt,
      );
      cleanup.push(() =>
        this.paths.cleanupRunDirectory(context.identity.taskRunId),
      );
      const node = await new ExecutionNodeBinding(this.paths).prepare(
        context,
        lease,
      );
      cleanup.push(node.cleanup);
      const materialized = await new ConfigMaterializationService().prepare(
        context.workspace,
        [...context.configSnapshot],
        lease,
      );
      cleanup.push(materialized.cleanup);
      const executor = new HookExecutor(leases.map((item) => item.handle.fd)),
        runner = new RunnerV2(executor);
      this.lifecycle = new TaskHookLifecycle(executor);
      if (this.cancelled) this.lifecycle.cancel();
      await redactor.write(`[ATTEMPT ${attempt}]\n`);
      const execution = await this.lifecycle.run(
        {
          task: { id: context.identity.taskId },
          environment: context.environmentSnapshot,
          secretValues: [...context.secretValues],
          workspace: context.workspace,
          hooks: [...context.hookSnapshot],
          directory,
          args: [...context.args],
          mainTimeout: context.settings.timeout_seconds ?? 0,
        },
        (text) => redactor.write(text),
        {
          persistEnvironment: false,
          redactor,
          main: (environment, output) =>
            runner.run(context, environment, output),
        },
      );
      const failures = execution.failures.map((item) => ({
        phase: item.phase,
        code: item.reason,
        ...(item.hook_id ? { hookId: item.hook_id } : {}),
      }));
      result.primaryError = execution.primary
        ? failures.find(
            (item) => `${item.phase}:${item.code}` === execution.primary,
          ) ?? { phase: 'LIFECYCLE', code: 'EXECUTION_FAILED' }
        : null;
      result.secondaryErrors = failures.filter(
        (item) => item !== result.primaryError,
      );
      result.hookResults = execution.hookResults;
      result.exitCode =
        execution.main && 'exitCode' in execution.main
          ? execution.main.exitCode ?? null
          : execution.main?.code ?? null;
      result.signal = execution.main?.signal ?? null;
      result.cancelled =
        this.cancelled || result.primaryError?.code === 'CANCELLED';
      result.timedOut = result.primaryError?.code === 'TIMEOUT';
      result.status = result.cancelled
        ? 'CANCELLED'
        : result.timedOut
        ? 'TIMEOUT'
        : result.primaryError
        ? 'FAILED'
        : 'SUCCESS';
    } catch (error) {
      result.primaryError = {
        phase: 'PREPARE',
        code: safeExecutionError(error),
      };
      result.status = this.cancelled ? 'CANCELLED' : 'FAILED';
      result.cancelled = this.cancelled;
    } finally {
      this.lifecycle = undefined;
      result.cleanupResult = 'SUCCESS';
      for (const operation of cleanup.reverse()) {
        try {
          await operation();
        } catch (error) {
          result.cleanupResult = 'RECOVERY_REQUIRED';
          result.status = 'RECOVERY_REQUIRED';
          const failure = {
            phase: 'CLEANUP',
            code: safeExecutionError(error, 'EXECUTION_RECOVERY_REQUIRED'),
          };
          if (!result.primaryError) result.primaryError = failure;
          else result.secondaryErrors.push(failure);
        }
      }
      if (result.primaryError?.code.includes('RECOVERY_REQUIRED')) {
        result.status = 'RECOVERY_REQUIRED';
        result.cleanupResult = 'RECOVERY_REQUIRED';
      }
      result.finishedAt = new Date().toISOString();
      result.duration = Date.now() - started;
      await redactor.write(`[RESULT ${result.status}]\n`);
      await redactor.flush();
    }
    return result;
  }
}
