// Real scheduler adapters against the same database and managed Runtime fixture.
const assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const {wait}=require('./helpers.cjs');
module.exports=async function parity(h,definition){
 await h.TaskHookModel.create({task_id:definition.id,name:'scheduled proof',phase:'BEFORE',command:'echo SCHEDULED_MANAGED_HOOK',cwd_base:'TASK_CWD',position:1,timeout_seconds:5,failure_policy:'FAIL_EXECUTION',enabled:true});
 const id=await require('../phase15/submit-cron.cjs')(h,definition.id);let result=await wait(h,id,30000);assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.trigger_type,'CRON');assert.ok((await h.execution.log(id)).includes('SCHEDULED_MANAGED_HOOK'));
 const Submission=h.load('back/services/executionSubmission.ts').ExecutionSubmissionServer,server=new Submission(h.execution);await server.start();
 try{const command=h.load('back/shared/executionLauncher.ts').executionLauncher(definition.id),child=spawn('/bin/sh',['-c',command]);let output='',error='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>error+=x);assert.equal(await new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject)}),0,error);const rows=await h.execution.list(definition.id);result=await wait(h,rows[0].id,30000);assert.equal(result.status,'SUCCESS',JSON.stringify(result));assert.equal(result.trigger_type,'SCHEDULE');assert.ok((await h.execution.log(result.id)).includes('SCHEDULED_MANAGED_HOOK'));}finally{await server.stop();}
};
