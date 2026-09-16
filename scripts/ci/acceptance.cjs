// Shared diagnostics adapter; the Phase12/14 scenarios and assertions remain intact.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const registry = process.env.QL_ACCEPTANCE_CANARIES;
const labels = [
  'local-e2e-only-backend-secret',
  'CONFIG_SECRET_E2E',
  'generated-private-e2e',
  'ENV_SECRET_E2E',
  'NOTIFICATION_SECRET_E2E',
  'UNIQUE_SUPER_SECRET_BACKUP_PASSPHRASE',
  'e2e-fixture-password',
  'workspace-backup-private-passphrase',
];
function read() {
  return registry
    ? JSON.parse(fs.readFileSync(registry, 'utf8'))
    : { seed: '', values: [] };
}
function secret(label) {
  if (!registry) return label;
  return (
    'fixture-' +
    crypto.createHmac('sha256', read().seed).update(label).digest('hex')
  );
}
function values() {
  return [...labels.map(secret), ...read().values];
}
function register(value) {
  if (!registry || !value) return;
  const r = read();
  if (!r.values.includes(value)) {
    r.values.push(value);
    fs.writeFileSync(registry, JSON.stringify(r), { mode: 0o600 });
  }
}
function payload(value) {
  if (!registry || value === undefined) return value;
  let text = JSON.stringify(value);
  for (const label of labels) text = text.split(label).join(secret(label));
  return JSON.parse(text);
}
function redact(value) {
  let text = String(value);
  for (const v of values().filter(Boolean))
    text = text.split(v).join('[REDACTED]');
  return text;
}
function output(fallback) {
  const dir = process.env.QL_ACCEPTANCE_DIR || fallback;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
function startIdentity(pid) {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}
function track(child) {
  if (!registry) return;
  const file = path.join(path.dirname(registry), 'owned-processes.json'),
    rows = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : [];
  rows.push({ pid: child.pid, start: startIdentity(child.pid) });
  fs.writeFileSync(file, JSON.stringify(rows), { mode: 0o600 });
}
function observe(page, dir) {
  const consoleRows = [],
    network = [];
  page.on('console', (m) => {
    if (consoleRows.length < 5000)
      consoleRows.push({
        type: m.type(),
        message: redact(m.text()).slice(0, 2000),
      });
  });
  page.on('pageerror', (e) => {
    if (consoleRows.length < 5000)
      consoleRows.push({
        type: 'pageerror',
        message: redact(e.message).slice(0, 2000),
      });
  });
  page.on('response', (r) => {
    if (network.length < 20000) {
      const u = new URL(r.url());
      network.push({
        method: r.request().method(),
        path: u.pathname.startsWith('/hooks/')
          ? '/hooks/[redacted]'
          : u.pathname,
        status: r.status(),
      });
    }
  });
  const screenshot = page.screenshot.bind(page);
  page.screenshot = (options) =>
    screenshot({
      ...options,
      mask: [
        ...(options?.mask || []),
        page.locator('input, textarea, [role="dialog"], .monaco-editor'),
        ...values()
          .filter(Boolean)
          .map((v) => page.getByText(v, { exact: false })),
      ],
    });
  return () => {
    fs.writeFileSync(
      path.join(dir, 'console.json'),
      JSON.stringify(consoleRows),
    );
    fs.writeFileSync(path.join(dir, 'network.json'), JSON.stringify(network));
  };
}
module.exports = {
  labels,
  secret,
  values,
  register,
  payload,
  redact,
  output,
  track,
  startIdentity,
  observe,
};
