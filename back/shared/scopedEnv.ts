export class ScopedEnvironmentError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
// Runner bookkeeping is not application configuration. Prevent a scope from rewriting
// commands, hooks, status identifiers or private transport paths inside sourced Bash tasks.
const RUNNER_NAMES = /^(?:PLATFORM_|QL_TASK_ENV_|PREV_|dir_|file_|cmd_|list_|task_shell_|script_params$|_task_exit_code$|which_program$|timeoutCmd$|ID$|SUB_ID$|work_dir$|real_time$|real_log_path$|no_tee$|log_path$|log_dir$|log_name$|envParam$|numParam$|UID$|EUID$|PPID$|BASHOPTS$|SHELLOPTS$|BASH_VERSINFO$|FUNCNAME$|PIPESTATUS$)/;
export function validateEnvironmentName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || name.length > 255 || !ENV_NAME.test(name) || RUNNER_NAMES.test(name)) throw new ScopedEnvironmentError('ENV_NAME_INVALID');
}
export function validateEnvironmentValue(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.includes('\0') || Buffer.byteLength(value) > 120 * 1024) throw new ScopedEnvironmentError('ENV_VALUE_INVALID');
}
