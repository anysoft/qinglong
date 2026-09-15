// Streaming replacement retains enough characters for secrets split across chunks.
const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const snapshot = JSON.parse(fs.readFileSync(process.env.QL_TASK_ENV_SNAPSHOT + '/snapshot.json', 'utf8'));
const secrets = [...new Set(snapshot.secretNames.flatMap(name => {
  const value = snapshot.variables[name];
  return value ? [value, ...value.split('&').filter(Boolean)].flatMap(part => [part, JSON.stringify(part).slice(1, -1), encodeURIComponent(part), Buffer.from(part).toString('base64')]) : [];
}))].sort((a, b) => b.length - a.length);
const max = Math.max(1, ...secrets.map(x => x.length));
const decoder = new StringDecoder('utf8');
let pending = '';
const pattern = secrets.length ? new RegExp(secrets.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g') : null;
function flush(final) {
  if (!pattern) { process.stdout.write(pending); pending = ''; return; }
  let end = final ? pending.length : Math.max(0, pending.length - max + 1);
  // Never split a Unicode surrogate pair between stdout writes.
  if (end && end < pending.length && /[\uD800-\uDBFF]/.test(pending[end - 1])) end--;
  let cursor = 0;
  let out = '';
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(pending)) && match.index < end) {
    out += pending.slice(cursor, match.index) + '********';
    cursor = match.index + match[0].length;
  }
  const consumed = Math.max(cursor, end);
  out += pending.slice(cursor, consumed);
  pending = pending.slice(consumed);
  if (out) process.stdout.write(out);
}
process.stdin.on('data', chunk => { pending += decoder.write(chunk); flush(false); });
process.stdin.on('end', () => { pending += decoder.end(); flush(true); });
