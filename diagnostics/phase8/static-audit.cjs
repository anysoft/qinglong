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
    if (forbidden.test(line)&&!file.startsWith('back/schema/platform')) failures.push({ file, line: index + 1, text: line.trim() });
    const oldHook=/task_before|task_after|sub_before|sub_after|\/tmp\/env_|generated hook env parser/.test(line);
    if(!broad.test(line)&&!oldHook)continue;
    let classification;
    if(file.startsWith('back/schema/platform')||file==='back/shared/operationalSchema.ts')classification=['Frozen platform v1 signature and explicit transactional v1→v2 conversion only; not an active hook field','Schema initializer','PLATFORM_CORE','KEEP while v1 upgrades are supported'];
    else if(file==='back/protos/api.proto'&&line.includes('reserved'))classification=['Retired protobuf field names/numbers reserved against reuse; no encode/decode field','SDK wire schema','PLATFORM_CORE','KEEP'];
    if (!classification && file === 'back/shared/gitProvider.ts' && /repoPath|rawPath/.test(line)) classification = ['Normalized URL path locals; no filesystem creation/ownership', 'Git URL validation', 'PLATFORM_CORE', 'KEEP'];
    else if (file === 'back/loaders/express.ts' || file === '.umirc.ts') classification = ['Non-secret frontend server configuration endpoint', 'UI bootstrap / serveEnv', 'PLATFORM_CORE', 'KEEP'];
    else if (file === 'shell/preload/sitecustomize.js' && line.includes('scoped-env.js')) classification = ['Full execution snapshot reader; no Global generated module', 'language preload', 'B06', '5–10'];
    else if ((file === 'shell/task.sh' || file === 'shell/otask.sh') && line.includes('file_env')) classification = ['Per-execution private environment.sh path, no shared Global file', 'current task runner', 'B02', '10'];
    else if (line.includes('crontab.list')) classification = ['System scheduler projection/config protection only; no Discovery reads', 'CronService / scheduler / config protection', 'B03', '10'];
    else if (file === 'src/locales/en-US.json' && line.includes('QL_TRUST_PROXY')) classification = ['English wording for proxy environment ownership; not subscription mode', 'security settings', 'PLATFORM_CORE', 'KEEP'];
    else if (/managed/i.test(line) && ['back/services/subscription.ts', 'back/services/managedSubscription.ts', 'back/services/cron.ts', 'back/gitSubscription.ts', 'back/api/subscription.ts'].includes(file)) classification = ['Internal class/log label for the sole normal pipeline; no mode field, selector, branch or fallback', 'Subscription sync / publication', 'B07', '11 (adapter replacement)'];
    if (!classification && ['back/data/worktree.ts', 'back/services/repositoryStorage.ts', 'back/shared/workspacePaths.ts', 'src/pages/repository-workspace.tsx'].includes(file) && /managed/i.test(line)) classification = ['Platform-owned Git storage/worktree path marker; not Subscription mode', 'Repository/Worktree ownership and path protection', 'PLATFORM_CORE', 'KEEP'];
    if (!classification && file === 'back/services/credentialSecret.ts') classification = ['Future encryption-key ownership wording; current storage remains plaintext at rest', 'Credential secret adapter', 'PLATFORM_CORE', 'KEEP'];
    if (!classification && file === 'back/config/const.ts' && line.includes('process.env.PYTHON_HOME')) classification = ['Runtime Python installation location; regex env.py substring, no generated file', 'dependency installer', 'B09', '6–8'];
    if (!classification && file === 'back/services/configMaterialization.ts' && /managed/i.test(line)) classification=['Private recovery ownership only','Config materializer','PLATFORM_CORE','KEEP'];
    if (!classification && /runtime|pyenvProvider|pythonEnvironment|pythonDependency|nodeEnvironment|nodePackageManager|nodeDistributionProvider|nodePaths/i.test(file) && /managed/i.test(line)) classification=['Platform-owned Runtime path; not Subscription mode','Runtime Manager','PLATFORM_CORE','KEEP'];
    if (!classification) { failures.push({ file, line: index + 1, text: line.trim(), reason: 'unclassified remaining reference' }); continue; }
    const [reason, consumer, bridge_id, removal_phase] = classification;
    findings.push({ file, line: index + 1, text: line.trim(), reason, consumer, bridge_id, removal_phase });
  }
}
for(const file of ['back/api/config.ts','back/services/config.ts','back/taskEnvironment.ts','shell/task_env_redact.cjs'])if(fs.existsSync(path.join(root,file)))failures.push({file,reason:'Removed dual implementation remains'});

const runtimeFiles=files.filter(file=>/^back\/(?:services\/(?:runtime|pyenvProvider)|api\/runtime|data\/runtime|shared\/runtime)/.test(file));
const violations=/TaskExecutionPreparation|TaskEnvironmentResolver|ConfigMaterializationLease|TaskWorkspaceResolver|DependenceService|PYTHON_INSTALL_DIR|GitCredential|data\/scripts|data\/deps|dep_cache|pyenv (?:global|local|shell|exec)|curl.*\|.*(?:bash|sh)|execSync|spawnSync/;
for(const file of runtimeFiles)for(const [index,line]of fs.readFileSync(path.join(root,file),'utf8').split('\n').entries())if(violations.test(line))failures.push({file,line:index+1,reason:'Runtime domain boundary violation'});
const protectedFiles=['back/services/taskExecutionPreparation.ts','back/services/taskWorkspace.ts','back/services/configMaterialization.ts','back/services/taskEnvironmentResolver.ts','back/services/dependence.ts','shell/task.sh','shell/otask.sh','shell/process_group.py','shell/hook_process.py'];
for(const file of protectedFiles){const diff=execFileSync('git',['diff','platform-phase5','--',file],{cwd:root,encoding:'utf8'});if(diff)failures.push({file,reason:'Protected Phase 5 execution contract changed'});}
const environmentFiles=files.filter(file=>/^back\/(?:services\/(?:pythonEnvironment|pythonDependency|pythonVenv|pipPackageManager)|api\/pythonEnvironment|data\/pythonEnvironment|shared\/pythonEnvironment)/.test(file));
for(const file of environmentFiles) for(const [index,line]of fs.readFileSync(path.join(root,file),'utf8').split('\n').entries()) if(violations.test(line)||/--system-site-packages|pip uninstall|source .*activate|process\.env\.(?:PYTHONPATH|PYTHONHOME|PIP_INDEX_URL)|shell:\s*true/.test(line)) failures.push({file,line:index+1,reason:'Python Environment domain violation'});
const dependencyFindings=[];
for(const file of files) for(const [index,line]of fs.readFileSync(path.join(root,file),'utf8').split('\n').entries()) {
 if(!/\bpip(?:3)?\b|site-packages|PYTHONPATH|PYTHONHOME|\bactivate\b|-m[ '\",]+venv/.test(line))continue;
 let classification;
 if(environmentFiles.includes(file)||/runtime|pyenvProvider/i.test(file)||file.startsWith('src/components/PythonEnvironments'))classification='PYTHON_ENVIRONMENT_OR_RUNTIME_DOMAIN';
 else if(/dependence|dep_cache|node_path_cache|back\/config\/const|docker|shell\/(?:task|otask|share|preload|api|update|sdk|ql|before|after)|shell\/ql\.sh/.test(file))classification='B02/B06/B09/B10 current Task dependency bridge';
 else if(['shell/hook_process.py','shell/git_workspace_lock.py','shell/execution_lease.py'].includes(file))classification='PLATFORM_CORE isolated POSIX supervisor/lease helper; ignores user Python search paths';
 else if(['shell/start.sh','back/services/system.ts','back/config/util.ts','sample/extra.sample.sh'].includes(file))classification='B02/B06/B09/B10 current Task package bootstrap, installer or legacy mirror setting; no Environment consumer';
 else if(file.startsWith('back/schema/platform'))classification='Frozen platform schema';
 if(!classification)failures.push({file,line:index+1,text:line.trim(),reason:'Unclassified Python package reference'});
 dependencyFindings.push({file,line:index+1,text:line.trim(),classification});
}
const nodeFiles=files.filter(file=>/^back\/(?:services\/node(?:Environment|PackageManager|DistributionProvider|Paths)|api\/nodeEnvironment|data\/nodeEnvironment|shared\/nodeEnvironment)|^shell\/node_archive\.py/.test(file));
const nodeFindings=[];
const nodePattern=/\bnvm\b|\bfnm\b|\bnodeenv\b|npm (?:install|i) -g|pnpm add -g|system node|\/usr\/bin\/node\b|\bNODE_PATH\b|shell\s*[:=]\s*(?:true|True)|child_process\.exec\(|os\.system|\b(?:npm_args|pnpm_args|install_args)\b|node_modules/i;
for(const file of files)for(const [index,line] of fs.readFileSync(path.join(root,file),'utf8').split('\n').entries()){
 if(nodeFiles.includes(file)&&(/\bNODE_PATH\b|\bnvm\b|\bfnm\b|npm (?:install|i) -g|pnpm add -g|\/usr\/bin\/node\b|shell\s*[:=]\s*(?:true|True)|child_process\.exec\(|os\.system|\.\.\.process\.env/.test(line)||violations.test(line)))failures.push({file,line:index+1,reason:'Node domain boundary violation'});
 if(!nodePattern.test(line))continue;
 let classification;
 if(nodeFiles.includes(file)||file==='src/components/NodeRuntime/index.tsx')classification='NODE_RUNTIME_ENVIRONMENT_DOMAIN: managed absolute CLI, own modules, safe paths';
 else if(file.startsWith('back/schema/platform'))classification='Frozen platform schema';
 else if(/^(docker\/|shell\/(?:start|share|preload|task|otask|update|api|ql|check|lang)|back\/config\/|back\/services\/(?:dependence|system)|src\/pages\/dependence|sample\/)/.test(file))classification='B02/B06/B09/B10/B12 existing Task dependencies or platform bootstrap/build tooling; no new Runtime consumer; Phase 9/10 exit gates';
 else if(file==='back/api/script.ts')classification='B01/B17 Script API protects node_modules internal directory from editing; no Environment binding';
 else if(file==='back/tsconfig.json'||file==='back/loaders/express.ts'||file==='.umirc.ts'||file==='back/shared/executionPath.ts')classification='PLATFORM_CORE application module/build path';
 if(!classification)failures.push({file,line:index+1,text:line.trim(),reason:'Unclassified Node dependency reference'});
 nodeFindings.push({file,line:index+1,text:line.trim(),classification});
}
const report = {node_files:nodeFiles.length,node_references:nodeFindings,environment_files:environmentFiles.length,dependency_references:dependencyFindings,runtime_files:runtimeFiles.length,protected_phase5_files:protectedFiles, status: failures.length ? 'FAIL' : 'PASS', production_files: files.length,
  forbidden_hits: failures, classified_remaining_hits: findings,
  scope: 'Production source only; historical docs and archived tests excluded. API/UI/domain negative assertions also run in platform tests.' };
fs.writeFileSync(path.join(__dirname, 'final-static-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.status}: ${files.length} files, ${failures.length} forbidden/unclassified, ${findings.length} explained references`);
if (failures.length) process.exitCode = 1;
