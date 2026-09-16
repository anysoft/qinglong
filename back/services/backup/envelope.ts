import fs from 'fs/promises';
import path from 'path';
import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import {
  BackupError,
  fail,
  openRegular,
  privateDirectory,
  writeAll,
} from './files';

// Format 1: fixed authenticated 64-byte header, ciphertext, 16-byte GCM tag.
// No attacker-controlled KDF cost or compression exists in this envelope.
const MAGIC = Buffer.from('PLATBKP1');
const HEADER_SIZE = 64,
  TAG_SIZE = 16;
export const MAX_PORTABLE_BYTES = 1024 ** 4; // 1 TiB, enforced on actual bytes.
function header() {
  const value = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(value);
  value[8] = 1;
  value[9] = 1;
  value[10] = 1;
  value.writeUInt32BE(32768, 12);
  value.writeUInt32BE(8, 16);
  value.writeUInt32BE(1, 20);
  randomBytes(16).copy(value, 24);
  randomBytes(12).copy(value, 40);
  return value;
}
function validateHeader(value: Buffer) {
  if (
    value.length !== HEADER_SIZE ||
    !value.subarray(0, 8).equals(MAGIC) ||
    value[8] !== 1 ||
    value[9] !== 1 ||
    value[10] !== 1 ||
    value[11] !== 0 ||
    value.readUInt32BE(12) !== 32768 ||
    value.readUInt32BE(16) !== 8 ||
    value.readUInt32BE(20) !== 1 ||
    value.subarray(52).some((x) => x !== 0)
  )
    fail('BACKUP_AUTHENTICATION_FAILED');
}
async function key(passphrase: Buffer, envelope: Buffer) {
  if (
    !Buffer.isBuffer(passphrase) ||
    !passphrase.length ||
    passphrase.length > 4096
  )
    fail('BACKUP_PASSPHRASE_INVALID');
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      passphrase,
      envelope.subarray(24, 40),
      32,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (err, result) =>
        err ? reject(new BackupError('BACKUP_KDF_FAILED')) : resolve(result),
    ),
  );
}
function counter(max: number) {
  let total = 0;
  return new Transform({
    transform(chunk, _, done) {
      total += chunk.length;
      done(total > max ? new BackupError('BACKUP_LIMIT') : null, chunk);
    },
  });
}
/** Callers own and clear passphrase buffers; strings must never be logged. */
export async function encryptPortable(
  source: string,
  destination: string,
  passphrase: Buffer,
  maxBytes = MAX_PORTABLE_BYTES,
) {
  await privateDirectory(path.dirname(destination));
  const input = await openRegular(source);
  let output: Awaited<ReturnType<typeof fs.open>> | undefined,
    derived: Buffer | undefined;
  try {
    if ((await input.stat()).size > maxBytes) fail('BACKUP_LIMIT');
    const envelope = header();
    derived = await key(passphrase, envelope);
    output = await fs.open(destination, 'wx', 0o600);
    await writeAll(output, envelope);
    const cipher = createCipheriv(
      'aes-256-gcm',
      derived,
      envelope.subarray(40, 52),
    );
    cipher.setAAD(envelope);
    await pipeline(
      input.createReadStream({ autoClose: false }),
      counter(maxBytes),
      cipher,
      async (chunks) => {
        for await (const chunk of chunks)
          await writeAll(output!, chunk as Buffer);
      },
    );
    await writeAll(output, cipher.getAuthTag());
    await output.sync();
  } catch (e) {
    if (output) await fs.unlink(destination).catch(() => {});
    throw e;
  } finally {
    derived?.fill(0);
    await input.close();
    await output?.close();
  }
}
/** Decrypt to a private opaque file. Extraction is only legal after this returns. */
export async function decryptPortable(
  source: string,
  destination: string,
  passphrase: Buffer,
  maxBytes = MAX_PORTABLE_BYTES,
) {
  await privateDirectory(path.dirname(destination));
  const input = await openRegular(source);
  let output: Awaited<ReturnType<typeof fs.open>> | undefined,
    derived: Buffer | undefined;
  try {
    const size = (await input.stat()).size;
    if (
      size < HEADER_SIZE + TAG_SIZE ||
      size > maxBytes + HEADER_SIZE + TAG_SIZE
    )
      fail('BACKUP_AUTHENTICATION_FAILED');
    const envelope = Buffer.alloc(HEADER_SIZE),
      tag = Buffer.alloc(TAG_SIZE);
    await input.read(envelope, 0, HEADER_SIZE, 0);
    validateHeader(envelope);
    await input.read(tag, 0, TAG_SIZE, size - TAG_SIZE);
    derived = await key(passphrase, envelope);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      derived,
      envelope.subarray(40, 52),
    );
    decipher.setAAD(envelope);
    decipher.setAuthTag(tag);
    output = await fs.open(destination, 'wx', 0o600);
    const stream =
      size === HEADER_SIZE + TAG_SIZE
        ? []
        : input.createReadStream({
            autoClose: false,
            start: HEADER_SIZE,
            end: size - TAG_SIZE - 1,
          });
    await pipeline(stream, counter(maxBytes), decipher, async (chunks) => {
      for await (const chunk of chunks)
        await writeAll(output!, chunk as Buffer);
    });
    await output.sync();
  } catch (e) {
    if (output) await fs.unlink(destination).catch(() => {});
    if (e instanceof BackupError) throw e;
    fail('BACKUP_AUTHENTICATION_FAILED');
  } finally {
    derived?.fill(0);
    await input.close();
    await output?.close();
  }
}
