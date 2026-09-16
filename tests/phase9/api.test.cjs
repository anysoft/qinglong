require('reflect-metadata');
const {test}=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {fixture,task}=require('../phase10/helpers.cjs');
test('Task HTTP definitions stay independent of legacy scheduler; API/MANUAL sources explicit',async t=>{
 const cleanup=[];const h=await fixture({after:fn=>cleanup.push(fn)}),{definition}=await task(h,undefined,{concurrency:'ALLOW'});
 h.mocks.typedi={...require('typedi'),Container:{get(Type){if(Type.name==='TaskService')return h.taskService;throw Error(Type.name);}}};
 const app=express();app.use(express.json());h.load('back/api/tasks.ts').default(app);
 t.after(async()=>{await h.load('back/services/triggerScheduler.ts').triggerScheduler.stop();await h.load('back/services/executionService.ts').executionService.stop();for(const close of cleanup.reverse())await close();});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const api=async(url,method='GET',body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,...await response.json()};};
 assert.equal(await h.SchedulerProjectionModel.count(),0);
 assert.equal((await api(`/tasks/${definition.id}/enabled`,'PUT',{enabled:false,expected_version:0})).status,409);
 const trigger=await api(`/tasks/${definition.id}/triggers`,'POST',{type:'CRON',config:{expression:'0 8 * * *',timezone:'UTC'}});assert.equal(trigger.status,200);
 assert.equal((await api(`/tasks/${definition.id}/triggers/${trigger.data.id}`,'PUT',{type:'CRON',config:{expression:'0 9 * * *'},expected_version:0})).status,409);
 const external=await api(`/tasks/${definition.id}/run`,'POST',{});assert.equal(external.status,200);assert.equal(external.data.trigger_type,'API');
 const manual=await api(`/tasks/${definition.id}/run`,'POST',{source:'MANUAL'});assert.equal(manual.data.trigger_type,'MANUAL');
 assert.equal((await api(`/tasks/${definition.id}/run`,'POST',{command:'unsafe'})).status,400);
 assert.equal(await h.SchedulerProjectionModel.count(),0);assert.equal((await api('/tasks')).data.data.length,1);
});
