const fs = require('node:fs'),
  path = require('node:path'),
  { spawn, execFileSync } = require('node:child_process');
const { repository, environment, atomic } = require('./context.cjs');
async function run(s, name, args, extra = {}, seconds = 3600) {
  if (!/^[a-z0-9-]+$/.test(name)) throw Error('INVALID_STAGE');
  const log = path.join(s.output, 'logs', name + '.log');
  fs.mkdirSync(path.dirname(log), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(log, 'w', 0o600);
  let size = 0,
    truncated = false;
  const started = new Date().toISOString();
  console.log('CI stage:', name);
  const child = spawn(
    'python3',
    [
      '-I',
      '-S',
      path.join(repository, 'shell/hook_process.py'),
      String(seconds),
      'bash',
      '-c',
      'umask 022; exec "$@"',
      'ci-stage',
      ...args,
    ],
    {
      cwd: repository,
      env: { ...environment(s), ...extra },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  // Detached browser/backend groups must remain attributable after their parent
  // exits. Never inspect arguments or environment; persist only PID identity.
  const ownershipFile = path.join(s.root, 'stage-' + name + '-processes.json');
  const seen = new Map();
  const observe = () => {
    const table = execFileSync('ps', ['-axo', 'pid=,ppid=,pgid=,lstart='], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const rows = table
      .split('\n')
      .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/))
      .filter(Boolean)
      .map((m) => ({
        pid: Number(m[1]),
        parent: Number(m[2]),
        group: Number(m[3]),
        start: m[4],
      }));
    const owned = new Set([child.pid]);
    for (const row of rows)
      if (seen.get(row.pid)?.start === row.start) owned.add(row.pid);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows)
        if (owned.has(row.parent) && !owned.has(row.pid)) {
          owned.add(row.pid);
          changed = true;
        }
    }
    for (const row of rows)
      if (owned.has(row.pid))
        seen.set(row.pid, {
          pid: row.pid,
          start: row.start,
          groupLeader: row.pid === row.group,
        });
    atomic(ownershipFile, [...seen.values()]);
  };
  let supervisionFailure = false;
  const monitor = setInterval(() => {
    try {
      observe();
    } catch {
      supervisionFailure = true;
      child.stdin.end();
    }
  }, 250);
  child.stdin.on('error', () => {});
  const interrupt = () => child.stdin.end();
  process.once('SIGTERM', interrupt);
  process.once('SIGINT', interrupt);
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      if (size + data.length > 64 * 1024 * 1024) {
        truncated = true;
        interrupt();
        return;
      }
      fs.writeSync(fd, data);
      size += data.length;
    });
  const code = await new Promise((resolve) => {
    child.once('error', () => resolve(127));
    child.once('close', (n) => resolve(n ?? 143));
  });
  clearInterval(monitor);
  process.removeListener('SIGTERM', interrupt);
  process.removeListener('SIGINT', interrupt);
  fs.closeSync(fd);
  const result = {
    name,
    status: code === 0 && !truncated && !supervisionFailure ? 'PASS' : 'FAIL',
    supervision_failed: supervisionFailure,
    exit_code: code,
    started,
    finished: new Date().toISOString(),
    bytes: size,
    truncated,
  };
  atomic(path.join(s.output, 'tests', name + '.json'), result);
  if (result.status !== 'PASS')
    throw Object.assign(Error('STAGE_FAILED: ' + name), {
      stage: name,
      exitCode: code,
    });
  return result;
}
module.exports = { run };
