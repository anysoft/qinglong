import 'reflect-metadata';
import fs from 'fs/promises';
import path from 'path';
import { platformPaths } from './services/backup/platform';
import { acquireBackendLease } from './services/backup/paths';
import { BackupCoordinator } from './services/backup/coordinator';
import { BackupOperations } from './services/backup/operations';
import { RestoreService } from './services/backup/restore';
import { fail, openRegular } from './services/backup/files';
async function passphrase(args: string[]) {
  const at = args.indexOf('--passphrase-file');
  let buffer: Buffer;
  if (at >= 0) {
    const file = await openRegular(path.resolve(args[at + 1] || ''));
    try {
      if ((await file.stat()).size > 4096) fail('BACKUP_PASSPHRASE_INVALID');
      buffer = await file.readFile();
    } finally {
      await file.close();
    }
  } else {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 4096) fail('BACKUP_PASSPHRASE_INVALID');
      chunks.push(Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
    for (const chunk of chunks) chunk.fill(0);
  }
  if (buffer.at(-1) === 10) buffer = buffer.subarray(0, buffer.length - 1);
  if (buffer.length < 12) fail('BACKUP_PASSPHRASE_INVALID');
  return buffer;
}
(async () => {
  const [command, id, ...args] = process.argv.slice(2),
    paths = await platformPaths(),
    backup = new BackupCoordinator(paths),
    restore = new RestoreService(paths),
    operations = new BackupOperations(paths);
  let result: unknown;
  if (command === 'list') result = await backup.list();
  else if (command === 'status') result = await restore.status();
  else if (command === 'validate') result = await backup.validate(id);
  else if (command === 'create') {
    const lease = await acquireBackendLease(paths);
    try {
      result = await operations.exclusive(() =>
        backup.create(600000, undefined, true),
      );
    } finally {
      await lease!.release();
    }
  } else if (command === 'export') {
    const phrase = await passphrase(args);
    try {
      result = {
        export_id: await operations.exclusive(() => backup.export(id, phrase)),
      };
    } finally {
      phrase.fill(0);
    }
  } else if (command === 'import') {
    const phrase = await passphrase(args);
    try {
      result = {
        import_id: await operations.exclusive(() =>
          backup.import(path.resolve(id), phrase),
        ),
      };
    } finally {
      phrase.fill(0);
    }
  } else if (command === 'stage')
    result = await operations.exclusive(() =>
      restore.stage(
        id,
        args.includes('--import') ? 'imports' : 'snapshots',
        true,
      ),
    );
  else if (command === 'apply' || command === 'recover')
    result = await restore.apply();
  else if (command === 'cancel')
    result = await operations.exclusive(() => restore.cancel());
  else fail('BACKUP_COMMAND_INVALID');
  process.stdout.write(JSON.stringify({ code: 200, data: result }) + '\n');
})().catch((e) => {
  const code = e.code || e.message;
  process.stderr.write(
    JSON.stringify({
      code: /^(BACKUP|RESTORE|PLATFORM)_[A-Z_]+$/.test(code)
        ? code
        : 'BACKUP_OPERATION_FAILED',
    }) + '\n',
  );
  process.exitCode = 1;
});
