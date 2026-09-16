const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture,task,wait}=require('./helpers.cjs');
test('EXPONENTIAL retry executes three total attempts with 1s then 2s backoff',async t=>{
 const h=await fixture(t),f=await task(h,'echo ATTEMPT_MARKER; exit 7',{max_attempts:3,initial_delay_seconds:1,backoff:'EXPONENTIAL'}),run=await h.execution.submit(f.definition.id),result=await wait(h,run.id,15000);assert.equal(result.status,'FAILED');assert.equal(result.attempt_count,3);const log=await h.execution.log(run.id);assert.equal(log.split('ATTEMPT_MARKER').length-1,3);assert.ok(log.includes('[RETRY 2 IN 1s]'));assert.ok(log.includes('[RETRY 3 IN 2s]'));
 const rows=await h.TaskRunAttemptModel.findAll({where:{task_run_id:run.id},order:[['attempt_number','ASC']]});assert.ok(new Date(rows[1].started_at)-new Date(rows[0].finished_at)>=900);assert.ok(new Date(rows[2].started_at)-new Date(rows[1].finished_at)>=1900);
});
test('ALLOW preserves same-task submissions while independent Worktrees execute concurrently',async t=>{
 const h=await fixture(t),shared=path.join(h.root,'barrier');await fs.mkdir(shared);const a=await task(h,'touch "$SHARED/a"; while [ ! -f "$SHARED/b" ]; do sleep .05; done',{concurrency:'ALLOW'}),b=await task(h,'touch "$SHARED/b"; while [ ! -f "$SHARED/a" ]; do sleep .05; done',{concurrency:'ALLOW'});
 for(const f of [a,b])await h.TaskEnvVariableModel.create({task_id:f.definition.id,name:'SHARED',value:shared,operation:'SET',status:'enabled'});
 const first=await h.execution.submit(a.definition.id),second=await h.execution.submit(a.definition.id),other=await h.execution.submit(b.definition.id);assert.equal(second.status,'QUEUED');
 await h.execution.tick();for(const run of [first,second,other])assert.equal((await wait(h,run.id)).status,'SUCCESS');assert.equal(await h.TaskRunAttemptModel.count(),3);
});
