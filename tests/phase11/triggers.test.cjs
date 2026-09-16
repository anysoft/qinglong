const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,task,wait}=require('../phase10/helpers.cjs');

test('Trigger schema fresh, typed configurations, webhook hash and rotation',async t=>{
 const h=await fixture(t),{definition}=await task(h);
 const service=new(h.load('back/services/taskTrigger.ts').default)();
 const hook=await service.save(definition.id,{type:'WEBHOOK',config:{}});
 assert.match(hook.secret,/^[A-Za-z0-9_-]{43}$/);assert.equal(hook.config.secret_hash,undefined);
 assert.equal(await service.authenticate(hook.config.public_id,'Bearer '+hook.secret),hook.id);
 const rotated=await service.rotate(definition.id,hook.id,1);
 await assert.rejects(service.authenticate(hook.config.public_id,'Bearer '+hook.secret));
 assert.equal(await service.authenticate(hook.config.public_id,'Bearer '+rotated.secret),hook.id);
 assert.equal(JSON.stringify(await service.list(definition.id)).includes(rotated.secret),false);
 await assert.rejects(service.save(definition.id,{type:'MANUAL',config:{}}));
 await assert.rejects(service.save(definition.id,{type:'CRON',config:{expression:'* * * * *',timezone:'Bogus/Zone'}}));
});

test('Event durable dedup, atomic submit/link, disabled skip, real execution',async t=>{
 const h=await fixture(t),{definition}=await task(h);
 const service=new(h.load('back/services/taskTrigger.ts').default)();
 const hook=await service.save(definition.id,{type:'WEBHOOK',config:{}});
 const Events=h.load('back/services/triggerEvents.ts').default,events=new Events(h.execution);
 const event=await events.receive(hook.id,'request:one');
 assert.equal((await events.receive(hook.id,'request:one')).id,event.id);
 await events.recover();const done=await events.dispatch(event.id);
 assert.equal(await h.TaskRunModel.count(),1);assert.equal(done.status,'SUBMITTED');
 assert.equal((await wait(h,done.task_run_id)).status,'SUCCESS');
 await h.TaskModel.update({enabled:false},{where:{id:definition.id}});
 const skipped=await events.receive(hook.id,'request:two');await events.dispatch(skipped.id);await skipped.reload();
 assert.equal(skipped.status,'SKIPPED');assert.equal(skipped.error_code,'TASK_DISABLED');
 assert.equal((await h.TaskRunModel.findByPk(skipped.task_run_id)).status,'SKIPPED');
});

test('Clock scheduler misfire SKIP and FIRE_ONCE, restart identity',async t=>{
 const h=await fixture(t),{definition}=await task(h,undefined,{concurrency:'ALLOW'});
 const service=new(h.load('back/services/taskTrigger.ts').default)();
 const skip=await service.save(definition.id,{type:'CRON',config:{expression:'* * * * *',timezone:'UTC'}});
 const fire=await service.save(definition.id,{type:'CRON',config:{expression:'* * * * *',timezone:'UTC',misfire_policy:'FIRE_ONCE'}});
 const now=new Date('2026-09-16T10:00:00Z');
 await h.CronTriggerModel.update({next_fire_at:new Date('2026-09-16T09:00:00Z')},{where:{trigger_id:[skip.id,fire.id]}});
 const Events=h.load('back/services/triggerEvents.ts').default,Scheduler=h.load('back/services/triggerScheduler.ts').default;
 const scheduler=new Scheduler({now:()=>now},new Events(h.execution));await scheduler.tick();
 assert.equal(await h.TriggerEventModel.count(),2);assert.equal(await h.TaskRunModel.count(),1);
 await new Scheduler({now:()=>now},new Events(h.execution)).tick();assert.equal(await h.TaskRunModel.count(),1);
});
test('Clone regenerates webhook credentials; deleted trigger and Task preserve event history',async t=>{
 const h=await fixture(t),{definition}=await task(h),service=new(h.load('back/services/taskTrigger.ts').default)();
 const hook=await service.save(definition.id,{type:'WEBHOOK',config:{}});
 const cloned=await h.taskService.clone(definition.id,'copy');assert.equal(cloned.enabled,false);assert.equal(cloned.webhook_secrets.length,1);
 const copy=cloned.webhook_secrets[0];assert.notEqual(copy.secret,hook.secret);assert.notEqual(copy.public_id,hook.config.public_id);await assert.rejects(service.authenticate(copy.public_id,'Bearer '+hook.secret));assert.equal(await service.authenticate(copy.public_id,'Bearer '+copy.secret),copy.trigger_id);
 const Events=h.load('back/services/triggerEvents.ts').default,events=new Events(h.execution),event=await events.receive(hook.id,'before:delete');
 await service.remove(definition.id,hook.id,1);await events.dispatch(event.id);await event.reload();assert.equal(event.trigger_id,null);assert.equal(event.status,'SKIPPED');
 await h.taskService.remove(definition.id,definition.version);await event.reload();assert.equal(event.task_id,null);assert.ok(event.task_run_id);assert.equal((await h.TaskRunModel.findByPk(event.task_run_id)).task_id,null);
});
test('Git event cannot execute a Task rebound to another repository before submission',async t=>{
 const h=await fixture(t),first=await task(h),second=await task(h),service=new(h.load('back/services/taskTrigger.ts').default)(),trigger=await service.save(first.definition.id,{type:'GIT_UPDATE',config:{mode:'ANY_CHANGE'}});
 const Events=h.load('back/services/triggerEvents.ts').default,events=new Events(h.execution),event=await events.receive(trigger.id,'git:binding',{repository_id:first.repository.id,worktree_id:first.worktree.id,before:'a'.repeat(40),after:'b'.repeat(40)});
 await h.TaskSourceModel.update({worktree_id:second.worktree.id},{where:{task_id:first.definition.id}});await events.dispatch(event.id);await event.reload();assert.equal(event.status,'SKIPPED');assert.equal(event.error_code,'GIT_SOURCE_BINDING_CHANGED');assert.equal((await h.TaskRunModel.findByPk(event.task_run_id)).status,'SKIPPED');
});
