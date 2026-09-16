import sqlite3 from 'sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fail, openRegular, privateDirectory } from './files';

export async function backupDatabase(file: string, writable = false) {
  const check = await openRegular(file);
  await check.close();
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const connection: sqlite3.Database = new sqlite3.Database(
      file,
      writable ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY,
      (error) =>
        error
          ? reject(new Error('BACKUP_DATABASE_OPEN_FAILED'))
          : resolve(connection),
    );
  });
  return {
    all: (sql: string, parameters: unknown[] = []) =>
      new Promise<any[]>((resolve, reject) =>
        db.all(sql, parameters, (error, rows) =>
          error
            ? reject(new Error('BACKUP_DATABASE_QUERY_FAILED'))
            : resolve(rows),
        ),
      ),
    close: () =>
      new Promise<void>((resolve, reject) =>
        db.close((error) =>
          error ? reject(new Error('BACKUP_DATABASE_CLOSE_FAILED')) : resolve(),
        ),
      ),
  };
}
export async function validateDatabase(file: string) {
  const db = await backupDatabase(file);
  try {
    const integrity = await db.all('PRAGMA integrity_check'),
      foreignKeys = await db.all('SELECT * FROM pragma_foreign_key_check LIMIT 1');
    if (
      integrity.length !== 1 ||
      integrity[0].integrity_check !== 'ok' ||
      foreignKeys.length
    )
      fail('BACKUP_DATABASE_INTEGRITY_FAILED');
    return { integrity: 'ok', foreign_keys: 0 };
  } finally {
    await db.close();
  }
}
/** Caller MUST hold the cross-resource barrier. VACUUM INTO creates a self-contained DB. */
export async function snapshotDatabase(source: string, destination: string) {
  await privateDirectory(path.dirname(destination));
  await fs.lstat(destination).then(
    () => fail('BACKUP_DESTINATION_EXISTS'),
    (e) => {
      if (e.code !== 'ENOENT') throw e;
    },
  );
  const db = await backupDatabase(source, true);
  try {
    await db.all('VACUUM INTO ?', [destination]);
  } finally {
    await db.close();
  }
  await fs.chmod(destination, 0o600);
  const result = await validateDatabase(destination),
    handle = await openRegular(destination);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  return result;
}
