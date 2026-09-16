import path from 'path';
import { executionSocketAddress } from './executionSocket';
import config from '../config';
import { ExecutionError } from './execution';
export function executionLauncher(taskId: number) {
  if (!Number.isSafeInteger(taskId) || taskId < 1)
    throw new ExecutionError('EXECUTION_ID_INVALID');
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
  return [
    process.execPath,
    path.join(config.rootPath, 'static/build/taskRunSubmit.js'),
    executionSocketAddress(config.dataPath),
    String(taskId),
  ]
    .map(quote)
    .join(' ');
}
