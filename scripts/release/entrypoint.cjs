'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
// Runs as the final service identity. Never chowns a mounted user directory.
if (process.getuid?.() === 0) throw Error('NON_ROOT_REQUIRED');
const data = process.env.DATA_DIR, backup = process.env.BACKUP_DIR;
for (const value of [data, backup, process.env.HOME]) {
  if (!value || !path.isAbsolute(value) || path.resolve(value) === '/') throw Error('DEDICATED_ABSOLUTE_PATH_REQUIRED');
  const parent = path.dirname(value);
  if (fs.realpathSync(parent) !== parent) throw Error('SYMLINK_PARENT_REJECTED');
  if (fs.existsSync(value) && fs.lstatSync(value).isSymbolicLink()) throw Error('SYMLINK_ROOT_REJECTED');
}
fs.mkdirSync(process.env.HOME, { recursive: true, mode: 0o700 });
// Secret lies outside the atomically replaced live state root, on the persistent data volume.
const secret = path.join(path.dirname(data), '.platform-jwt');
if (!fs.existsSync(secret)) {
  const temporary = secret + '.' + crypto.randomUUID();
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, crypto.randomBytes(48).toString('hex')); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.linkSync(temporary, secret); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  finally { fs.unlinkSync(temporary); }
  const parent = fs.openSync(path.dirname(secret), 'r'); try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
}
const fd = fs.openSync(secret, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
try {
  const stat = fs.fstatSync(fd);
  if (!stat.isFile() || stat.nlink !== 1 || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw Error('SECRET_FILE_UNSAFE');
  const value = fs.readFileSync(fd, 'utf8');
  if (!/^[a-f0-9]{96}$/.test(value)) throw Error('SECRET_FILE_INVALID');
  process.env.JWT_SECRET = value;
} finally { fs.closeSync(fd); }
process.env.QL_DATA_DIR = data;
process.env.QL_DIR = '/app';
require('/app/static/build/app.js');
