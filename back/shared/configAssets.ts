import fs from 'fs/promises';
import path from 'path';
export class ConfigAssetError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}
export const TEXT_ASSET_LIMIT = 1024 * 1024;
export const HOOK_OUTPUT_LIMIT = 64 * 1024;
export const configId = (value: unknown) => {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new ConfigAssetError('INVALID_RESOURCE_ID');
  return Number(value);
};
export function targetPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\0') ||
    Buffer.from(value, 'utf8').toString('utf8') !== value ||
    value.includes('\\') ||
    path.isAbsolute(value) ||
    Buffer.byteLength(value) > 2048
  )
    throw new ConfigAssetError('CONFIG_TARGET_INVALID');
  const parts = value.normalize('NFC').split('/');
  if (
    parts.some(
      (x) =>
        !x ||
        x === '.' ||
        x === '..' ||
        Buffer.byteLength(x) > 255 ||
        /^(?:\.git|\.locks|\.tmp|\.platform.*)$/i.test(x),
    )
  )
    throw new ConfigAssetError('CONFIG_TARGET_INVALID');
  return parts.join('/');
}
export async function safeParents(
  root: string,
  relative: string,
  create = false,
) {
  const checked = targetPath(relative);
  const base = await fs.realpath(root);
  if ((await fs.lstat(root)).isSymbolicLink())
    throw new ConfigAssetError('CONFIG_UNSAFE_PATH');
  let current = base;
  for (const part of checked.split('/').slice(0, -1)) {
    current = path.join(current, part);
    if (create) {
      await fs.mkdir(current, { mode: 0o700 }).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
      await syncDirectory(path.dirname(current));
    }
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new ConfigAssetError('CONFIG_UNSAFE_PATH');
  }
  return path.join(base, checked);
}
export async function privateDirectory(directory: string) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new ConfigAssetError('CONFIG_UNSAFE_STORAGE');
  await fs.chmod(directory, 0o700);
  await syncDirectory(path.dirname(directory));
}
export async function atomicPrivateWrite(
  file: string,
  content: string | Buffer,
  mode = 0o600,
) {
  const temporary =
    file + '.tmp-' + require('crypto').randomBytes(10).toString('hex');
  try {
    const handle = await fs.open(temporary, 'wx', mode);
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
    await syncDirectory(path.dirname(file));
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}
/** Persist directory entries as well as file bytes on supported POSIX filesystems. */
export async function syncDirectory(directory: string) {
  const handle = await fs.open(directory, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
