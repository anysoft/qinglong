const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {runtimeFixture}=require('./helpers.cjs');
test('Runtime API returns tracked async IDs, denies arbitrary commands/paths and sanitizes every error',async t=>{
 const h=await runtimeFixture(t),app=express();app.use(express.json());h.load('back/api/runtime.ts').default(app,h.service);app.use(h.load('back/shared/scopedEnvHttp.ts').scopedEnvironmentHttpError);
 const router=express.Router();h.load('back/api/runtime.ts').default(router,h.service);app.use('/open',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const responses=[],base=`http://127.0.0.1:${server.address().port}`,api=async(url,method='GET',body)=>{const r=await fetch(base+url,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();responses.push(text);return {status:r.status,...JSON.parse(text)};};
 const root='/runtime/python';assert.equal((await api(root+'/provider')).data.state,'UNINITIALIZED');
 assert.equal((await api('/open'+root+'/provider/setup','POST',{})).status,403);
 const setup=await api(root+'/provider/setup','POST',{});assert.equal(setup.status,202);assert.ok(setup.data.id);assert.equal(setup.data.owner_pid,undefined);assert.equal(setup.data.owner_token,undefined);assert.equal(setup.data.metadata,undefined);assert.equal((await h.service.wait(setup.data.id)).status,'SUCCESS');
 for(const body of [{version:'3.12.12',command:'SECRET_SENTINEL'},{version:'3.12.12',executable_path:'/tmp/SECRET_SENTINEL'},{version:'3.12.12',jobs:99},{version:'3.12.12',timeout_seconds:999999},{version:'3.12.12;SECRET_SENTINEL'}])assert.equal((await api(root+'/installations','POST',body)).status,400);
 const install=await api(root+'/installations','POST',{version:'3.12.12'});assert.equal(install.status,202);assert.equal((await h.service.wait(install.data.id)).status,'SUCCESS');
 for(const url of ['/catalog','/installations','/operations',`/operations/${install.data.id}`,`/operations/${install.data.id}/log`,'/diagnostics'])assert.equal((await api(root+url)).status,200);
 const row=(await api(root+'/installations')).data[0];assert.equal((await api(root+`/installations/${row.id}/references`)).data.count,0);
 const deleted=await api(root+`/installations/${row.id}`,'DELETE',{});assert.equal((await h.service.wait(deleted.data.id)).status,'SUCCESS');
 const bad=await fetch(base+root+'/installations',{method:'POST',headers:{'content-type':'application/json'},body:'{"version":"SECRET_SENTINEL",broken}'});assert.equal(bad.status,400);responses.push(await bad.text());
 assert.ok(responses.every(x=>!x.includes('SECRET_SENTINEL')));
});
