const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {fixture,task,wait}=require('./helpers.cjs');
test('manual, scheduler and protected system-cron launcher share canonical Config/Hooks results',async t=>{
 const h=await fixture(t),f=await task(h,'cat config.txt; printf MAIN_PARITY; exit 7',{concurrency:'QUEUE'});
 const assets=new(h.load('back/services/configAsset.ts').default)(),asset=await assets.save({name:'parity',is_secret:false,content:'CONFIG_PARITY'});
 await new(h.load('back/services/taskConfig.ts').default)().save('task',f.definition.id,{asset_id:asset.id,operation:'ATTACH',target_base:'WORKSPACE_ROOT',target_path:'config.txt',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,enabled:true});
 for(const phase of ['BEFORE','AFTER_FAILURE','FINALLY'])await h.TaskHookModel.create({task_id:f.definition.id,name:phase,phase,command:'printf '+phase+'_PARITY',cwd_base:'TASK_CWD',position:1,timeout_seconds:5,failure_policy:'FAIL_EXECUTION',enabled:true});
 const shared=h.load('back/services/executionService.ts').executionService;
 const Submission=h.load('back/services/executionSubmission.ts').ExecutionSubmissionServer,server=new Submission(shared);await server.start();t.after(()=>server.stop());t.after(()=>shared.stop());
 const manual=await h.load('back/services/taskExecutionFacade.ts').default.prototype.run(f.definition.id);
 const scheduled=await require('../phase15/submit-cron.cjs')(h,f.definition.id);
 const command=h.load('back/shared/executionLauncher.ts').executionLauncher(f.definition.id);assert.ok(!command.includes('main.sh'));
 const child=spawn('/bin/sh',['-c',command],{stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',x=>errors+=x);assert.equal(await new Promise(resolve=>child.on('close',resolve)),0,errors);
 const runs=await shared.list(f.definition.id);assert.equal(runs.length,3);assert.equal(runs.filter(row=>row.trigger_type==='SCHEDULE').length,1);assert.equal(runs.filter(row=>row.trigger_type==='CRON').length,1);
 for(const run of [...runs].reverse()){const result=await wait(h,run.id);assert.equal(result.status,'FAILED');assert.equal(result.exit_code,7);const log=await h.execution.log(run.id);for(const token of ['CONFIG_PARITY','BEFORE_PARITY','MAIN_PARITY','AFTER_FAILURE_PARITY','FINALLY_PARITY'])assert.ok(log.includes(token),log);await assert.rejects(fs.stat(path.join(f.root,'config.txt')),{code:'ENOENT'});}
 const sock=h.load('back/shared/executionSocket.ts').executionSocketAddress(h.root);assert.equal((await fs.stat(sock)).mode&0o777,0o600);assert.equal((await fs.stat(path.dirname(sock))).mode&0o777,0o700);
});
test('durable cancellation cannot overwrite a completed run or affect a newer run',async t=>{
 const h=await fixture(t),f=await task(h,'printf done',{concurrency:'QUEUE'});const first=await h.execution.submit(f.definition.id);const finished=await wait(h,first.id);await h.execution.cancel(first.id);assert.equal((await h.execution.get(first.id)).status,'SUCCESS');
 const next=await h.execution.submit(f.definition.id);await h.execution.cancel(first.id);assert.equal((await h.execution.get(next.id)).cancel_requested,false);assert.equal((await wait(h,next.id)).status,'SUCCESS');assert.equal((await h.execution.get(first.id)).finished_at.toISOString(),finished.finished_at.toISOString());
});
