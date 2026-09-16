import path from 'path';
import { ExecutionContext, ExecutionError } from '../shared/execution';
import HookExecutor from './hookExecutor';

/** Program and argv come exclusively from an immutable managed resolution. */
export default class RunnerV2 {
  constructor(private executor: HookExecutor) {}
  async run(
    context: ExecutionContext,
    environment: NodeJS.ProcessEnv,
    output: (text: string) => Promise<void>,
  ) {
    const { executable, kind, tsxCli } = context.runtime;
    if (
      !path.isAbsolute(executable) ||
      !path.isAbsolute(context.source.absoluteEntrypoint)
    )
      throw new ExecutionError('EXECUTION_PROGRAM_INVALID');
    if (kind === 'SHELL' && executable !== '/bin/sh')
      throw new ExecutionError('EXECUTION_SHELL_INVALID');
    if (context.source.language === 'TYPESCRIPT' && !tsxCli)
      throw new ExecutionError('TSX_REQUIRED');
    const args = [
      ...(tsxCli ? [tsxCli] : []),
      context.source.absoluteEntrypoint,
      ...context.args,
    ];
    const env = { ...environment };
    // Hooks cannot reactivate the host's language loaders or dependency layout.
    for (const key of Object.keys(env))
      if (
        /^(?:NODE_PATH|NODE_OPTIONS|PYTHONPATH|PYTHONHOME|PYTHONSTARTUP|BASH_ENV|ENV|LD_.*|DYLD_.*)$/.test(
          key,
        )
      )
        delete env[key];
    env.PATH = `${path.dirname(executable)}:/usr/bin:/bin`;
    if (context.runtime.venvRoot) {
      env.VIRTUAL_ENV = context.runtime.venvRoot;
      env.PYTHONNOUSERSITE = '1';
    }
    return this.executor.run(
      executable,
      args,
      context.source.cwd,
      env,
      context.settings.timeout_seconds ?? 0,
      output,
    );
  }
}
