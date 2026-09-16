import fs from 'fs/promises';
import path from 'path';
import HookExecutor from './hookExecutor';
import ExecutionRedactor from './executionRedactor';
import { applyHookOutput, ExecutionEnvironment } from './hookOutput';
import type { ResolvedTaskEnvironment } from './taskEnvironmentResolver';
import type { TaskWorkspace } from './configMaterialization';
import { TaskHook, HookPhase } from '../data/configAsset';
import { ConfigAssetError, atomicPrivateWrite } from '../shared/configAssets';
export interface LifecycleOptions {
  event?: (type: string, metadata: {phase?:string; hook_id?:number}) => Promise<void>;
  main: (
    environment: NodeJS.ProcessEnv,
    output: (text: string) => Promise<void>,
  ) => Promise<{
    code: number;
    reason: string;
    exitCode?: number | null;
    signal?: string | null;
  }>;
  redactor?: ExecutionRedactor;
}
export interface HookLifecyclePlan {
  environment: ResolvedTaskEnvironment;
  secretValues: string[];
  workspace: TaskWorkspace;
  hooks: TaskHook[];
  directory: string;
  args: string[];
  mainTimeout: number;
  task: { id?: number; work_dir?: string } | null;
}
export interface LifecycleResult {
  code: number;
  main?: {
    code: number;
    reason: string;
    exitCode?: number | null;
    signal?: string | null;
  };
  hookResults: {
    hookId: number;
    phase: string;
    code: number;
    reason: string;
  }[];
  primary: string | null;
  failures: { phase: string; hook_id?: number; reason: string }[];
}
export default class TaskHookLifecycle {
  constructor(private executor = new HookExecutor()) {}
  private cancelled = false;
  cancel() {
    this.cancelled = true;
    this.executor.cancel();
  }
  async run(
    plan: HookLifecyclePlan,
    sink: (text: string) => Promise<void>,
    options: LifecycleOptions,
  ) {
    let environment: ExecutionEnvironment = {
      variables: { ...plan.environment.variables },
      secretNames: [...plan.environment.secretNames],
      secretValues: [...plan.secretValues],
    };
    const redactor = options.redactor ?? new ExecutionRedactor([], sink);
    redactor.add(environment.secretValues);
    const result: LifecycleResult = {
      code: 0,
      primary: null,
      failures: [],
      hookResults: [],
    };
    const record = (
      phase: string,
      reason: string,
      hook?: TaskHook,
      code = 1,
    ) => {
      result.failures.push({ phase, hook_id: hook?.id, reason });
      if (!hook || hook.failure_policy === 'FAIL_EXECUTION') {
        if (!result.primary) {
          result.primary = `${phase}:${reason}`;
          result.code = code;
        }
      }
    };
    const context = (phase: string) => ({
      ...environment.variables,
      PLATFORM_TASK_ID: String(plan.task?.id ?? ''),
      PLATFORM_HOOK_PHASE: phase,
      PLATFORM_WORKSPACE_ROOT: plan.workspace.workspaceRoot,
      PLATFORM_TASK_DIR: plan.workspace.taskDir,
    });
    const phase = async (name: HookPhase) => {
      const eventPhase = name.startsWith('AFTER') ? 'AFTER' : name;
      await options.event?.(eventPhase + '_STARTED', {phase:name});
      for (const hook of plan.hooks
        .filter((x) => x.phase === name)
        .sort((a, b) => a.position - b.position || a.id - b.id)) {
        if (name === 'BEFORE' && this.cancelled) break;
        try {
          await redactor.write(`[${name}] ${hook.name}\n`);
          const output = path.join(plan.directory, `hook-${hook.id}.json`),
            command = path.join(plan.directory, `hook-${hook.id}.sh`);
          await atomicPrivateWrite(output, '');
          await atomicPrivateWrite(command, hook.command);
          let beforeLog = '',
            overflow = false;
          const execution = await this.executor.run(
            '/bin/sh',
            [command],
            hook.cwd_base === 'WORKSPACE_ROOT'
              ? plan.workspace.workspaceRoot
              : plan.workspace.cwd,
            { ...context(name), PLATFORM_HOOK_OUTPUT: output },
            hook.timeout_seconds,
            async (chunk) => {
              if (name === 'BEFORE') {
                if (
                  Buffer.byteLength(beforeLog) + Buffer.byteLength(chunk) >
                  4 * 1024 * 1024
                ) {
                  overflow = true;
                  this.executor.cancel();
                } else beforeLog += chunk;
              } else await redactor.write(chunk);
            },
          );
          result.hookResults.push({
            hookId: hook.id,
            phase: name,
            ...execution,
          });
          let outputValid = true;
          try {
            environment = await applyHookOutput(output, name, environment);
            redactor.add(environment.secretValues);
          } catch (error) {
            outputValid = false;
            record(
              name,
              error instanceof ConfigAssetError
                ? error.code
                : 'HOOK_OUTPUT_INVALID',
              hook,
            );
          }
          if (outputValid && name === 'BEFORE') await redactor.write(beforeLog);
          if (!outputValid)
            await redactor.write(`[${name}] HOOK_OUTPUT_REJECTED\n`);
          if (overflow) record(name, 'HOOK_OUTPUT_LOG_LIMIT', hook);
          else if (execution.code !== 0)
            record(name, execution.reason, hook, execution.code);
          await redactor.flush();
          if (
            name === 'BEFORE' &&
            hook.failure_policy === 'FAIL_EXECUTION' &&
            (!outputValid || overflow || execution.code !== 0)
          )
            break;
        } catch (error) {
          record(
            name,
            error instanceof ConfigAssetError
              ? error.code
              : 'HOOK_EXECUTION_FAILED',
            hook,
          );
          if (name === 'BEFORE' && hook.failure_policy === 'FAIL_EXECUTION')
            break;
        }
      }
      await options.event?.(eventPhase + '_FINISHED', {phase:name});
    };
    try {
      await phase('BEFORE');
      if (this.cancelled && !result.primary)
        record('MAIN', 'CANCELLED', undefined, 143);
      if (!result.primary) {
        await redactor.write('[MAIN]\n');
        await options.event?.('MAIN_STARTED', {});
        const main = await options.main(context('MAIN'), (chunk) =>
          redactor.write(chunk),
        );
        await options.event?.('MAIN_FINISHED', {});
        result.main = main;
        if (this.cancelled) record('MAIN', 'CANCELLED', undefined, 143);
        else if (main.code !== 0)
          record('MAIN', main.reason, undefined, main.code);
        await redactor.flush();
      }
      await phase(result.primary ? 'AFTER_FAILURE' : 'AFTER_SUCCESS');
    } catch (error) {
      record(
        'LIFECYCLE',
        error instanceof ConfigAssetError ? error.code : 'EXECUTION_FAILED',
      );
    } finally {
      try {
        await phase('FINALLY');
      } catch {
        record('FINALLY', 'HOOK_EXECUTION_FAILED');
      }
      await redactor.flush();
    }
    return result;
  }
}
