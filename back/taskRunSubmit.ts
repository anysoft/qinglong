import net from 'net';
import fs from 'fs/promises';
import path from 'path';
/** Narrow system-cron client. No source, argv, ENV, command or result callback. */
async function submit() {
  const [socketPath, taskId] = process.argv.slice(2);
  if (
    process.argv.length !== 4 ||
    !path.isAbsolute(socketPath ?? '') ||
    !/^[1-9]\d*$/.test(taskId ?? '') ||
    !Number.isSafeInteger(Number(taskId))
  )
    throw Error('INVALID_SUBMISSION');
  const directory = await fs.lstat(path.dirname(socketPath)),
    socketStat = await fs.lstat(socketPath);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.mode & 0o077 ||
    !socketStat.isSocket() ||
    socketStat.mode & 0o077 ||
    (process.getuid && socketStat.uid !== process.getuid())
  )
    throw Error('INVALID_SUBMISSION_SOCKET');
  await new Promise<void>((resolve, reject) => {
    const socket: net.Socket = net.createConnection(socketPath, () =>
      socket.write(taskId + '\n'),
    );
    socket.setTimeout(5000, () => socket.destroy(Error('SUBMISSION_TIMEOUT')));
    let response = '';
    socket.on('data', (chunk) => {
      response += chunk.toString();
      if (response.length > 4096) socket.destroy(Error('INVALID_RESPONSE'));
    });
    socket.on('error', reject);
    socket.on('end', () => {
      try {
        const run = JSON.parse(response);
        if (!Number.isSafeInteger(run.id)) throw Error();
        resolve();
      } catch {
        reject(Error('SUBMISSION_FAILED'));
      }
    });
  });
}
void submit().catch(() => {
  process.stderr.write('TASK_SUBMISSION_FAILED\n');
  process.exitCode = 1;
});
