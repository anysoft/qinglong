const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const files = execFileSync('rg', ['--files', 'back', 'src', 'shell', 'docker', 'sample'], { cwd: root, encoding: 'utf8' }).trim().split('\n').concat('.umirc.ts');
const forbidden = /\bgit_mode\b|\bLEGACY\b|legacyCheckoutName|\bupdate_repo\b|\bupdate_raw\b|\bgit_clone_scripts\b|\bdata\/(?:repo|raw)(?:\/|\b)|\bpull_option\b|\bpull_type\b|convertSubscription|\bset_envs\b|global\.(?:js|py)|require\(['"]\.\/env\.js|import .*\benv\.py/;
const broad = /Managed|MANAGED|legacy|repoPath|rawPath|env\.js|env\.py|file_env|crontab\.list/i;
const findings = [], failures = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const [index, line] of source.split('\n').entries()) {
    if (forbidden.test(line)) failures.push({ file, line: index + 1, text: line.trim() });
    if (!broad.test(line)) continue;
    let classification;
    if (file === 'back/shared/gitProvider.ts' && /repoPath|rawPath/.test(line)) classification = ['Normalized URL path locals; no filesystem creation/ownership', 'Git URL validation', 'PLATFORM_CORE', 'KEEP'];
    else if (file === 'back/loaders/express.ts' || file === '.umirc.ts') classification = ['Non-secret frontend server configuration endpoint', 'UI bootstrap / serveEnv', 'PLATFORM_CORE', 'KEEP'];
    else if (file === 'shell/preload/sitecustomize.js' && line.includes('scoped-env.js')) classification = ['Full execution snapshot reader; no Global generated module', 'language preload', 'B06', '5–10'];
    else if ((file === 'shell/task.sh' || file === 'shell/otask.sh') && line.includes('file_env')) classification = ['Per-execution private environment.sh path, no shared Global file', 'current task runner', 'B02', '10'];
    else if (line.includes('crontab.list')) classification = ['System scheduler projection/config protection only; no Discovery reads', 'CronService / scheduler / config protection', 'B03', '10'];
    else if (file === 'src/locales/en-US.json' && line.includes('QL_TRUST_PROXY')) classification = ['English wording for proxy environment ownership; not subscription mode', 'security settings', 'PLATFORM_CORE', 'KEEP'];
    else if (/managed/i.test(line) && ['back/services/subscription.ts', 'back/services/managedSubscription.ts', 'back/services/cron.ts', 'back/gitSubscription.ts', 'back/api/subscription.ts'].includes(file)) classification = ['Internal class/log label for the sole normal pipeline; no mode field, selector, branch or fallback', 'Subscription sync / publication', 'B07', '11 (adapter replacement)'];
    if (!classification && ['back/data/worktree.ts', 'back/services/repositoryStorage.ts', 'back/shared/workspacePaths.ts', 'src/pages/repository-workspace.tsx'].includes(file) && /managed/i.test(line)) classification = ['Platform-owned Git storage/worktree path marker; not Subscription mode', 'Repository/Worktree ownership and path protection', 'PLATFORM_CORE', 'KEEP'];
    if (!classification && file === 'back/services/credentialSecret.ts') classification = ['Future encryption-key ownership wording; current storage remains plaintext at rest', 'Credential secret adapter', 'PLATFORM_CORE', 'KEEP'];
    if (!classification && file === 'back/config/const.ts' && line.includes('process.env.PYTHON_HOME')) classification = ['Runtime Python installation location; regex env.py substring, no generated file', 'dependency installer', 'B09', '6–8'];
    if (!classification) { failures.push({ file, line: index + 1, text: line.trim(), reason: 'unclassified remaining reference' }); continue; }
    const [reason, consumer, bridge_id, removal_phase] = classification;
    findings.push({ file, line: index + 1, text: line.trim(), reason, consumer, bridge_id, removal_phase });
  }
}
const report = { status: failures.length ? 'FAIL' : 'PASS', production_files: files.length,
  forbidden_hits: failures, classified_remaining_hits: findings,
  scope: 'Production source only; historical docs and archived tests excluded. API/UI/domain negative assertions also run in platform tests.' };
fs.writeFileSync(path.join(__dirname, 'final-static-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status}: ${files.length} files, ${failures.length} forbidden/unclassified, ${findings.length} explained references`);
if (failures.length) process.exitCode = 1;
