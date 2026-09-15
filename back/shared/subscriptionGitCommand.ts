import config from '../config';
import fs from 'fs';
import path from 'path';
import { quoteGitShell } from './gitSecurity';
export function repositorySubscriptionCommand(id: number) {
  const compiled = path.join(
    config.rootPath,
    'static/build/gitSubscription.js',
  );
  return fs.existsSync(compiled)
    ? `${quoteGitShell(process.execPath)} ${quoteGitShell(compiled)} ${Number(
        id,
      )}`
    : `ts-node-transpile-only ${quoteGitShell(
        path.join(config.rootPath, 'back/gitSubscription.ts'),
      )} ${Number(id)}`;
}
