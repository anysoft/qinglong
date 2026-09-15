export const pythonEnvironmentOperationTypes = [
  'PYTHON_ENV_BUILD',
  'PYTHON_ENV_REBUILD',
  'PYTHON_ENV_VERIFY',
  'PYTHON_ENV_PROMOTE',
  'PYTHON_ENV_DELETE',
  'PYTHON_ENV_DELETE_BUILD',
] as const;
export type PythonEnvironmentOperationType =
  (typeof pythonEnvironmentOperationTypes)[number];
export interface PythonEnvironmentOperationInput {
  environment_id: number;
  build_id?: number;
  expected_version: number;
}
