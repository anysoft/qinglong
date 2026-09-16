export class RuntimeError extends Error {
  constructor(
    public error_code: string,
    public status = 409,
    public exit_code?: number,
  ) {
    super(error_code);
    this.name = 'RuntimeError';
  }
}
export const runtimeId = (value: unknown) => {
  const id = Number(value);
  if (
    (typeof value !== 'number' &&
      (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))) ||
    !Number.isSafeInteger(id) ||
    id <= 0
  )
    throw new RuntimeError('RUNTIME_REQUEST_INVALID', 400);
  return id;
};
export function exactPythonVersion(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^3\.(?:0|[1-9]\d?)\.(?:0|[1-9]\d{0,2})$/.test(value)
  )
    throw new RuntimeError('RUNTIME_VERSION_UNAVAILABLE', 400);
  return value;
}
export const PYENV_RELEASE = 'v2.8.5';
export const PYENV_REVISION = 'c293de3650a2d08ea36c5f6f0d55c5a3841b0c72';
export const PYENV_SOURCE = 'https://github.com/pyenv/pyenv.git';
export const RUNTIME_LOG_LIMIT = 16 * 1024 * 1024;
export const RUNTIME_LOG_WINDOW = 64 * 1024;
export const RUNTIME_TIMEOUT_SECONDS = 3600;
export const RUNTIME_TOOL_PATH =
  '/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin';
