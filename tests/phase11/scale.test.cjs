const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture,task}=require('../phase10/helpers.cjs');
test('5000 files discovery batches database writes and preview is deterministic',async t=>{
 const h=await fixture(t),{repository,worktree,root}=await task(h);
 await fs.rm(path.join(root,'main.sh'));const sub=await h.SubscriptionModel.create({repository_id:repository.id,worktree_id:worktree.id,name:'scale'});
 for(let i=0;i<5000;i++)await fs.writeFile(path.join(root,`job-${String(i).padStart(5,'0')}.sh`),'# cron: 0 8 * * *\nprintf ok\n');
 await fs.mkdir(path.join(root,'node_modules'));await fs.writeFile(path.join(root,'node_modules','ignored.sh'),'');
 const service=new(h.load('back/services/discovery.ts').default)();
 const first=await service.preview(sub.id),second=await service.preview(sub.id);assert.deepEqual(first,second);assert.equal(first.changes.length,5000);
 let queries=0;h.db.options.logging=()=>queries++;const start=Date.now();
 const result=await service.reconcile(sub.id);const writesQueries=queries;h.db.options.logging=false;
 assert.equal(result.counts.CREATE,5000);assert.ok(writesQueries<80,`Queries must be batched: ${writesQueries}`);
 assert.equal(await h.TaskTriggerModel.count(),5000);
 assert.equal((await service.reconcile(sub.id)).counts.UNCHANGED,5000);
 console.log(JSON.stringify({discovery_files:5000,queries:writesQueries,duration_ms:Date.now()-start}));
});
test('5000 cron definitions use indexed due query and one shared scheduler timer',async t=>{
 const h=await fixture(t),{definition}=await task(h);
 const rows=await h.TaskTriggerModel.bulkCreate(Array.from({length:5000},()=>({task_id:definition.id,type:'CRON',origin:'USER',enabled:true})),{returning:true});
 await h.CronTriggerModel.bulkCreate(rows.map(r=>({trigger_id:r.id,expression:'0 8 * * *',timezone:'UTC',misfire_policy:'SKIP',next_fire_at:new Date('2030-01-01T08:00:00Z')})));
 const [plan]=await h.db.query("EXPLAIN QUERY PLAN SELECT * FROM CronTriggers WHERE next_fire_at <= '2026-09-16' ORDER BY next_fire_at,trigger_id LIMIT 500");
 assert.ok(plan.some(p=>/INDEX cron_triggers_next_fire_at_trigger_id/.test(p.detail)));
 const Events=h.load('back/services/triggerEvents.ts').default,Scheduler=h.load('back/services/triggerScheduler.ts').default;
 const scheduler=new Scheduler({now:()=>new Date('2026-09-16T00:00:00Z')},new Events(h.execution));
 let count=0;const interval=global.setInterval;global.setInterval=(...args)=>{count++;return interval(...args);};
 try{scheduler.start();scheduler.start();await scheduler.stop();}finally{global.setInterval=interval;}
 assert.equal(count,1);assert.equal(await h.TriggerEventModel.count(),0);
 console.log(JSON.stringify({cron_triggers:5000,timers:count,query_plan:plan}));
});
