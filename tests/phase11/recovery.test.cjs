const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const {fixture,task}=require('../phase10/helpers.cjs');
for(const point of ['before-link','after-commit'])test(`Actual SIGKILL ${point} recovers one TaskRun`,async t=>{
 const h=await fixture(t),{definition}=await task(h),service=new(h.load('back/services/taskTrigger.ts').default)();
 const trigger=await service.save(definition.id,{type:'WEBHOOK',config:{}}),Events=h.load('back/services/triggerEvents.ts').default,events=new Events(h.execution),event=await events.receive(trigger.id,'recovery:test');
 const child=spawnSync(process.execPath,['-r','ts-node/register/transpile-only',path.resolve('tests/phase11/crash-worker.cjs'),h.root,String(event.id),point],{env:process.env,encoding:'utf8'});
 assert.equal(child.signal,'SIGKILL',child.stderr);await events.recover();await events.dispatch(event.id);assert.equal(await h.TaskRunModel.count(),1);await event.reload();assert.equal(event.status,'SUBMITTED');assert.ok(event.task_run_id);
});
test('Two real scheduler processes race on one due time without duplicate Event or Run',async t=>{
 const h=await fixture(t),{definition}=await task(h),service=new(h.load('back/services/taskTrigger.ts').default)(),trigger=await service.save(definition.id,{type:'CRON',config:{expression:'* * * * *',timezone:'UTC',misfire_policy:'FIRE_ONCE'}});
 const now='2026-09-16T10:00:00.000Z';await h.CronTriggerModel.update({next_fire_at:new Date(now)},{where:{trigger_id:trigger.id}});
 const {spawn}=require('node:child_process');
 const worker=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-r','ts-node/register/transpile-only',path.resolve('tests/phase11/scheduler-worker.cjs'),h.root,now],{env:process.env,stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(output)));});
 await Promise.all([worker(),worker()]);assert.equal(await h.TriggerEventModel.count(),1);assert.equal(await h.TaskRunModel.count(),1);
});
