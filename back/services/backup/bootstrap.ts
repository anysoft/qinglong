import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { fail, privateDirectory } from './files';
/** Establish private SQLite permissions before Sequelize can open/create the file. */
export async function prepareOperationalDatabase(data: string) {
  for (const directory of [data, path.join(data, 'db')]) {
    await fs.mkdir(directory, { mode: 0o700 }).catch((e) => {
      if (e.code !== 'EEXIST') throw e;
    });
    const handle = await fs.open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      const stat = await handle.stat();
      if (
        !stat.isDirectory() ||
        (process.getuid && stat.uid !== process.getuid())
      )
        fail('BACKUP_PERMISSION_INVALID');
      await handle.chmod(0o700);
    } finally {
      await handle.close();
    }
    await privateDirectory(directory);
  }
  const file = await fs.open(
    path.join(data, 'db/database.sqlite'),
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (process.getuid && stat.uid !== process.getuid())
    )
      fail('BACKUP_FILE_INVALID');
    await file.chmod(0o600);
    await file.sync();
  } finally {
    await file.close();
  }
}
