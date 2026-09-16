require('reflect-metadata');
const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {fixture}=require('./helpers.cjs');
test('Config/Hook API contracts deny Secret plaintext in all responses and sanitize malformed payloads',async t=>{
 const h=await fixture(t),app=express();app.use(express.json({limit:'2mb'}));h.load('back/api/configAssets.ts').default(app);app.use(h.load('back/shared/scopedEnvHttp.ts').scopedEnvironmentHttpError);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const secret='API_SECRET_SENTINEL',responses=[];
 const api=async(url,method='GET',body)=>{const response=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await response.text();responses.push(text);return {status:response.status,...JSON.parse(text)};};
 const create=await api('/config-assets','POST',{name:'secret',is_secret:true,content:secret});assert.equal(create.code,200);const a=create.data;
 assert.equal((await api(`/config-assets/${a.id}/content`)).status,403);
 for(const url of ['/config-assets',`/config-assets/${a.id}/revisions`,`/config-assets/${a.id}/usage`])assert.equal((await api(url)).code,200);
 const task=await h.SchedulerProjectionModel.create({command:'task main.sh'}),binding=await api(`/tasks/${task.id}/config-bindings`,'POST',{asset_id:a.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,enabled:true});assert.equal(binding.code,200);
 assert.equal((await api(`/tasks/${task.id}/config-preview`)).code,200);assert.equal((await api(`/config-assets/${a.id}?version=${a.version}`,'DELETE')).status,409);
 const hook=await api(`/tasks/${task.id}/hooks`,'POST',{name:'before',command:'echo safe',phase:'BEFORE',cwd_base:'TASK_CWD',position:10,timeout_seconds:1,failure_policy:'CONTINUE',enabled:true});assert.equal(hook.code,200);
 assert.equal((await api(`/tasks/${task.id}/hooks/${hook.data.id}`,'PUT',{...hook.data,id:undefined,task_id:undefined,createdAt:undefined,updatedAt:undefined,version:undefined,expected_version:0})).status,400);
 for(const url of ['/config-assets',`/tasks/${task.id}/hooks`,`/tasks/${task.id}/config-bindings`]){const response=await fetch(`http://127.0.0.1:${server.address().port}${url}`,{method:'POST',headers:{'content-type':'application/json'},body:`{"content":"${secret}",broken}`});responses.push(await response.text());assert.equal(response.status,400);}
 assert.ok(responses.every(x=>!x.includes(secret)),responses.join('\n'));
});
