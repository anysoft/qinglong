export const nodeOperationTypes = [
  'NODE_CATALOG_REFRESH',
  'NODE_RUNTIME_INSTALL',
  'NODE_RUNTIME_VERIFY',
  'NODE_RUNTIME_REPAIR',
  'NODE_RUNTIME_REMOVE',
  'NODE_PACKAGE_MANAGER_INSTALL',
  'NODE_PACKAGE_MANAGER_VERIFY',
  'NODE_PACKAGE_MANAGER_REMOVE',
  'NODE_ENV_BUILD',
  'NODE_ENV_REBUILD',
  'NODE_ENV_RESOLVE',
  'NODE_ENV_VERIFY',
  'NODE_ENV_PROMOTE',
  'NODE_ENV_DELETE',
  'NODE_ENV_DELETE_BUILD',
] as const;
export type NodeOperationType = (typeof nodeOperationTypes)[number];
export type NodeManagerType = 'PNPM' | 'NPM';
export type NodeDependency = {
  name: string;
  specifier: string;
  type: 'DEPENDENCY' | 'DEV_DEPENDENCY';
};
export type NodePolicies = {
  production_only: boolean;
  install_scripts_policy: 'ALLOW' | 'IGNORE';
};
export type NodeResolvedPackage = {
  name: string;
  version: string;
  direct: boolean;
  dependency_type: string;
};
export type NodeOperationInput = {
  runtime_id?: number;
  version?: string;
  manager_type?: NodeManagerType;
  toolchain_id?: number;
  environment_id?: number;
  build_id?: number;
  expected_version?: number;
  timeout_seconds?: number;
};
export type NodeCatalogEntry = {
  version: string;
  date: string;
  lts: string | false;
  files: string[];
  npm: string | null;
};
