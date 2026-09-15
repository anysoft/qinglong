import fs from 'fs/promises';
import {
  validateEnvironmentName,
  validateEnvironmentValue,
} from '../shared/scopedEnv';
import { ConfigAssetError, HOOK_OUTPUT_LIMIT } from '../shared/configAssets';
export interface ExecutionEnvironment {
  variables: Record<string, string>;
  secretValues: string[];
  secretNames: string[];
}
export async function applyHookOutput(
  file: string,
  phase: string,
  current: ExecutionEnvironment,
) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > HOOK_OUTPUT_LIMIT)
    throw new ConfigAssetError('HOOK_OUTPUT_INVALID');
  const raw = await fs.readFile(file, 'utf8');
  if (!raw.trim()) return current;
  let value: any;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ConfigAssetError('HOOK_OUTPUT_INVALID');
  }
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    Object.keys(value).some((x) => x !== 'environment')
  )
    throw new ConfigAssetError('HOOK_OUTPUT_INVALID');
  if (value.environment === undefined) return current;
  if (phase !== 'BEFORE')
    throw new ConfigAssetError('HOOK_ENV_PHASE_FORBIDDEN');
  const patch = value.environment;
  if (
    !patch ||
    Array.isArray(patch) ||
    typeof patch !== 'object' ||
    Object.keys(patch).some((x) => !['set', 'unset', 'secret'].includes(x))
  )
    throw new ConfigAssetError('HOOK_OUTPUT_INVALID');
  const set = patch.set ?? {},
    unset = patch.unset ?? [],
    secret = patch.secret ?? [];
  if (
    !set ||
    typeof set !== 'object' ||
    Array.isArray(set) ||
    !Array.isArray(unset) ||
    !Array.isArray(secret) ||
    Object.keys(set).length + unset.length > 128 ||
    secret.length > 128
  )
    throw new ConfigAssetError('HOOK_OUTPUT_INVALID');
  const validateName = (name: unknown) => {
    try {
      validateEnvironmentName(name);
      if ((name as string).startsWith('PLATFORM_')) throw new Error();
    } catch {
      throw new ConfigAssetError('HOOK_ENV_INVALID');
    }
  };
  for (const [name, value] of Object.entries(set)) {
    validateName(name);
    try {
      validateEnvironmentValue(value);
    } catch {
      throw new ConfigAssetError('HOOK_ENV_INVALID');
    }
  }
  for (const name of [...unset, ...secret]) validateName(name);
  if (unset.some((name: string) => Object.hasOwnProperty.call(set, name)))
    throw new ConfigAssetError('HOOK_ENV_INVALID');
  const variables = { ...current.variables, ...set };
  for (const name of unset) delete variables[name];
  if (secret.some((name: string) => !Object.prototype.hasOwnProperty.call(variables, name)))
    throw new ConfigAssetError('HOOK_ENV_INVALID');
  if (
    Object.entries(variables).reduce(
      (total, [name, value]) =>
        total +
        Buffer.byteLength(name) +
        Buffer.byteLength(value as string) +
        2,
      0,
    ) >
    128 * 1024
  )
    throw new ConfigAssetError('HOOK_ENV_TOO_LARGE');
  const names = [...new Set([...current.secretNames, ...secret])] as string[];
  return {
    variables,
    secretNames: names,
    secretValues: [
      ...new Set([
        ...current.secretValues,
        ...names.map((name) => Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : undefined).filter(Boolean),
      ]),
    ],
  } as ExecutionEnvironment;
}
