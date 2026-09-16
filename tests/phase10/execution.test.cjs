const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture,task,wait}=require('./helpers.cjs');
test('native shell argv, direct Worktree cwd, immutable resolver, no host secrets',async t=>{
 const h=await fixture(t),f=await task(h,'printf "%s\\n" "$PWD" "$1" "$2" "${JWT_SECRET-unset}"',{}, {entry:'odd;touch INJECTED%job.sh',arguments:['space value','$(touch injected)']});
 const run=await h.execution.submit(f.definition.id);
 const resolved=await h.execution.resolver.resolve(f.definition.id,run.id);
 assert.ok(Object.isFrozen(resolved.context));assert.ok(Object.isFrozen(resolved.context.args));assert.ok(Object.isFrozen(resolved.context.environmentSnapshot.variables));await resolved.release();
 const result=await wait(h,run.id);assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.attempt_count,1);
 const log=await h.execution.log(run.id);assert.ok(log.includes(f.root));assert.ok(log.includes('space value'));assert.ok(log.includes('$(touch injected)'));assert.ok(log.includes('unset'));await assert.rejects(fs.stat(path.join(f.root,'injected')),{code:'ENOENT'});
 assert.equal((await h.TaskRunAttemptModel.findOne()).status,'SUCCESS');
});
test('real exit 124 is FAILED, supervisor timeout is TIMEOUT, cancellation is CANCELLED',async t=>{
 const h=await fixture(t),a=await task(h,'exit 124'),b=await task(h,'sleep 30',{timeout_seconds:1}),c=await task(h,'sleep 30');
 assert.equal((await wait(h,(await h.execution.submit(a.definition.id)).id)).status,'FAILED');
 assert.equal((await wait(h,(await h.execution.submit(b.definition.id)).id)).status,'TIMEOUT');
 const run=await h.execution.submit(c.definition.id);await h.execution.tick();await new Promise(r=>setTimeout(r,200));await h.execution.cancel(run.id);assert.equal((await wait(h,run.id)).status,'CANCELLED');
});
test('FORBID persists skipped submission, QUEUE is FIFO, queued cancel never spawns',async t=>{
 const h=await fixture(t),f=await task(h,'sleep .2');
 const a=await h.execution.submit(f.definition.id),b=await h.execution.submit(f.definition.id);assert.equal(b.status,'SKIPPED');assert.equal((await wait(h,a.id)).status,'SUCCESS');
 await h.TaskExecutionSettingsModel.update({concurrency:'QUEUE'},{where:{task_id:f.definition.id}});
 const c=await h.execution.submit(f.definition.id),d=await h.execution.submit(f.definition.id),e=await h.execution.submit(f.definition.id);
 await h.execution.cancel(e.id);assert.equal((await wait(h,c.id)).status,'SUCCESS');assert.equal((await wait(h,d.id)).status,'SUCCESS');assert.equal((await h.execution.get(e.id)).status,'CANCELLED');assert.equal(await h.TaskRunAttemptModel.count({where:{task_run_id:e.id}}),0);
});
test('retry attempts freeze scoped ENV and settings; each BEFORE patch starts from snapshot',async t=>{
 const h=await fixture(t),f=await task(h,'printf "%s\\n" "$VALUE"; if [ ! -f done ]; then touch done; exit 3; fi',{max_attempts:2,initial_delay_seconds:1});
 await h.TaskEnvVariableModel.create({task_id:f.definition.id,name:'VALUE',value:'original',operation:'SET',status:'enabled'});
 const run=await h.execution.submit(f.definition.id);await h.execution.tick();
 for(let i=0;i<100;i++){if(await h.TaskRunAttemptModel.count({where:{task_run_id:run.id,status:'FAILED'}}))break;await new Promise(r=>setTimeout(r,20));}
 await h.TaskEnvVariableModel.update({value:'edited'},{where:{task_id:f.definition.id}});await h.TaskExecutionSettingsModel.update({max_attempts:1},{where:{task_id:f.definition.id}});
 const result=await wait(h,run.id);assert.equal(result.status,'SUCCESS');assert.equal(result.attempt_count,2);const log=await h.execution.log(run.id);assert.equal(log.split('original').length-1,2);assert.ok(!log.includes('edited'));
});
test('BEFORE generated secret is redacted before buffered output and MAIN, FINALLY runs',async t=>{
 const h=await fixture(t),f=await task(h,'printf "%s" "$TOKEN"');
 await h.TaskHookModel.create({task_id:f.definition.id,name:'generate',phase:'BEFORE',command:'printf \'{"environment":{"set":{"TOKEN":"generated-sensitive"},"secret":["TOKEN"]}}\' > "$PLATFORM_HOOK_OUTPUT"; printf generated-sensitive',cwd_base:'TASK_CWD',position:1,timeout_seconds:10,failure_policy:'FAIL_EXECUTION',enabled:true});
 await h.TaskHookModel.create({task_id:f.definition.id,name:'finish',phase:'FINALLY',command:'printf finally-marker',cwd_base:'TASK_CWD',position:1,timeout_seconds:10,failure_policy:'FAIL_EXECUTION',enabled:true});
 const run=await h.execution.submit(f.definition.id),result=await wait(h,run.id);assert.equal(result.status,'SUCCESS',JSON.stringify(result));const log=await h.execution.log(run.id);assert.ok(!log.includes('generated-sensitive'));assert.ok(log.includes('********'));assert.ok(log.includes('finally-marker'));assert.ok(!JSON.stringify(result).includes('generated-sensitive'));
});
