const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {runtimeFixture}=require('../phase6/helpers.cjs');
test('Environment API scopes, strict input, definitions, optimistic revisions, reference protection and safe empty deletion',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');await h.run('RUNTIME_INSTALL',{version:'3.12.12'});
 const app=express();app.use(express.json());h.load('back/api/runtime.ts').default(app,h.service);const router=express.Router();h.load('back/api/runtime.ts').default(router,h.service);app.use('/open',router);app.use(h.load('back/shared/scopedEnvHttp.ts').scopedEnvironmentHttpError);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const responses=[],root=`http://127.0.0.1:${server.address().port}`,base='/runtime/python/environments';
 const api=async(url,method='GET',body)=>{const r=await fetch(root+url,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),data=await r.json();responses.push(JSON.stringify(data));return {status:r.status,...data};};
 assert.equal((await api('/open'+base,'POST',{name:'bad',runtime_id:1,requirements:[]})).status,403);
 for(const extra of [{venv_path:'/SECRET_SENTINEL'},{command:'SECRET_SENTINEL'},{index_url:'https://SECRET_SENTINEL@host/'},{pip_args:['--target','SECRET_SENTINEL']}])assert.equal((await api(base,'POST',{name:'bad',runtime_id:1,requirements:[],...extra})).status,400);
 for(const req of ['--index-url evil','-r file','-e .','foo$(command)','`command`','foo\nbar','../../package','file:///tmp/secret','pkg @ https://user:SECRET_SENTINEL@host/x'])assert.equal((await api(base,'POST',{name:'bad',runtime_id:1,requirements:[req]})).status,400);
 const created=await api(base,'POST',{name:'isolated',runtime_id:1,requirements:[]});assert.equal(created.status,200);const id=created.data.id;
 assert.equal((await api(`/runtime/python/installations/1/references`)).data.count,2);
 assert.equal((await api('/runtime/python/installations/1','DELETE',{})).message,'RUNTIME_REFERENCED');
 assert.equal((await api('/runtime/python/installations/1/repair','POST',{})).message,'RUNTIME_REFERENCED');
 const revision=await api(base+`/${id}/revisions`,'POST',{runtime_id:1,requirements:[],expected_version:1});assert.equal(revision.status,200);
 assert.equal((await api(base+`/${id}/revisions`,'POST',{runtime_id:1,requirements:[],expected_version:1})).message,'PYTHON_ENV_VERSION_CONFLICT');
 const info=await api(base+`/${id}`,'PATCH',{name:'renamed',description:'metadata only',expected_version:2});assert.equal(info.data.version,3);assert.equal(await h.PythonEnvironmentBuildModel.count(),0);
 for(const suffix of ['',`/${id}`,`/${id}/revisions`,`/${id}/builds`,`/${id}/operations`,'/diagnostics'])assert.equal((await api(base+suffix)).status,200);
 const clone=await api(base+`/${id}/clone`,'POST',{name:'copy'});assert.equal(clone.status,200);
 for(const target of [{id,version:3},{id:clone.data.id,version:1}]){const op=await api(base+`/${target.id}`,'DELETE',{expected_version:target.version});assert.equal(op.status,202);assert.equal((await h.service.wait(op.data.id)).status,'SUCCESS');}
 assert.equal((await api('/runtime/python/installations/1/references')).data.count,0);
 assert.equal((await h.run('RUNTIME_REMOVE',{runtime_id:1})).status,'SUCCESS');
 assert.ok(responses.every(x=>!x.includes('SECRET_SENTINEL')));
});
