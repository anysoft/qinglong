// Phase 10 replaces the old "Phase 5 files must never change" audit with explicit execution boundaries.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const files=execFileSync('rg',['--files','back','shell','src'],{encoding:'utf8'}).trim().split('\n');
const core=['back/services/executionService.ts','back/services/executionResolver.ts','back/services/executionAttemptCoordinator.ts','back/services/executionNodeBinding.ts','back/services/executionPaths.ts','back/services/executionLog.ts','back/services/runnerV2.ts'];
const forbidden=[];
for(const file of core){const source=fs.readFileSync(file,'utf8');for(const [i,line]of source.split('\n').entries())if(/(?:from|import\()\s*['"].*(?:taskExecutionPreparation|taskWorkspace|executionEnvironmentTransport|dependence|cron['"]|script['"])/.test(line)||/data\/(?:scripts|deps)|dep_cache|\/open\/|npx\s|shell:\s*true|execSync|child_process\.exec\(/.test(line))forbidden.push({file,line:i+1,text:line.trim()});}
function check(file,pattern,reason){if(!pattern.test(fs.readFileSync(file,'utf8')))forbidden.push({file,reason});}
check('back/shared/runCron.ts',/executionService\.submit/,'scheduled adapter must submit a Task ID');
check('back/shared/executionLauncher.ts',/taskRunSubmit/,'crond must use the protected ID launcher');
check('back/services/taskExecutionBridge.ts',/executionService/,'manual API must use execution domain');
for(const file of ['shell/task.sh','shell/otask.sh'])check(file,/PLATFORM_RECOVERY_TEST_ONLY[\s\S]*LEGACY_EXECUTION_DISABLED/,'legacy product entrypoint must be disabled');
check('back/services/executionResolver.ts',/TaskResourceResolver/,'reuse resource precedence');
check('back/services/executionResolver.ts',/freezeExecutionSnapshot/,'freeze execution data');
check('back/services/executionService.ts',/cleanupRunDirectory/,'recover private execution files');
check('back/services/executionNodeBinding.ts',/current\.ino !== journal\.identity\.ino/,'unknown bindings must survive recovery');
check('back/services/cron.ts',/stopInstance\(instanceId: number\)\s*\{[\s\S]*?Use TaskRun cancellation by run ID/,'old PID stop transport must not kill persisted PID');
const references=[];
for(const file of files)if(/\.(?:ts|tsx|js|py|sh)$/.test(file))for(const [i,line]of fs.readFileSync(file,'utf8').split('\n').entries())if(/NODE_PATH|PYTHONPATH|dep_cache|task\.sh|otask\.sh|RunningInstance|\/open\/crons/.test(line))references.push({file,line:i+1,text:line.trim(),classification:core.includes(file)?'RUNNER_V2_FILTER_OR_BOUNDARY':/hookExecutor|hook_process|runtimeProcess|process_group|node|python|runtime/i.test(file)?'MANAGED_RUNTIME_OR_SHARED_SUPERVISOR':/^shell\/|dependence|back\/config\/|services\/(?:system|cron|script|taskExecution|taskHook|executionEnvironment)|back\/api\/(?:cron|dashboard)|back\/data\/|back\/loaders\/|back\/shared\/|src\//.test(file)?'RETAINED_BRIDGE_BOOTSTRAP_HISTORY_OR_EDITOR':'REVIEWED_NON_RUNNER_REFERENCE'});
const report={status:forbidden.length?'FAIL':'PASS',production_files:files.length,core_files:core,forbidden_hits:forbidden,remaining_references:references,linux_removal:'BLOCKED_BY_LINUX_GATE',scope:'Normal Task execution boundaries plus retained bridge inventory; source matches are not proof of dynamic unreachability.'};
fs.writeFileSync(path.join(__dirname,'final-static-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,files:files.length,forbidden:forbidden.length,remaining:references.length}));if(forbidden.length)process.exitCode=1;
