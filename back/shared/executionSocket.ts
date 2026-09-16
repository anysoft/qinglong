import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
/** Unix socket paths have a small kernel limit. Never embed the data-root path. */
export function executionSocketAddress(dataRoot: string) {
  const identity = createHash('sha256')
    .update(fs.realpathSync(dataRoot))
    .digest('hex')
    .slice(0, 24);
  return path.join(
    '/tmp',
    `platform-execution-${process.getuid?.() ?? 'user'}-${identity}`,
    'submit.sock',
  );
}
