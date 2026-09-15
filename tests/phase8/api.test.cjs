const test=require('node:test'),assert=require('node:assert/strict'),express=require('express');
const {runtimeFixture}=require('../phase6/helpers.cjs');
test('Node panel-only strict API, identity scoping, optimistic definitions and resource-owned operations',async t=>{
 const h=await runtimeFixture(t),s=h.service.node,p=await s.getProvider();const r=await h.RuntimeInstallationModel.create({provider_id:p.id,language:'NODE',implementation:'NODEJS',version:'22.19.0',state:'READY',executable_relative_path:'bin/node',metadata:{npm_version:'10.9.3'}});const tool=await h.NodePackageManagerToolchainModel.create({runtime_id:r.get('id'),manager_type:'NPM',version:'10.9.3',state:'READY'});
 // Command-boundary fixture only; route/domain/schema/locks are production code.
 s.packages.validate=async(ctx,runtime,deps)=>deps;s.packages.verify=async()=>({version:'10.9.3'});
 const app=express();app.use(express.json());h.load('back/api/runtime.ts').default(app,h.service);const router=express.Router();h.load('back/api/runtime.ts').default(router,h.service);app.use('/open',router);const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const root='http://127.0.0.1:'+server.address().port,responses=[];
 const api=async(url,method='GET',body)=>{const response=await fetch(root+url,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),value=await response.json();responses.push(JSON.stringify(value));return {status:response.status,...value};};
 const base='/runtime/node',input={name:'api-node',runtime_id:Number(r.get('id')),toolchain_id:Number(tool.get('id')),dependencies:[]};
 assert.equal((await api('/open'+base+'/catalog')).status,403);
 for(const extra of [{node_path:'/SECRET_SENTINEL'},{node_modules_path:'/SECRET_SENTINEL'},{pnpm_path:'/SECRET_SENTINEL'},{store_path:'/SECRET_SENTINEL'},{command:'SECRET_SENTINEL'},{install_args:[]},{pnpm_args:[]},{registry:'https://SECRET_SENTINEL@host/'}])assert.equal((await api(base+'/environments','POST',{...input,...extra})).status,400);
 for(const body of [{version:'22.19.0',path:'/SECRET_SENTINEL'},{version:'latest'}])assert.equal((await api(base+'/installations','POST',body)).status,400);
 const e=(await api(base+'/environments','POST',input)).data;assert.ok(e.id);assert.equal((await api(base+'/installations/'+r.get('id')+'/references')).data.count,3);
 assert.equal((await api(base+'/environments/'+e.id,'PATCH',{name:'renamed',description:'metadata',expected_version:1})).data.version,2);
 assert.equal((await api(base+'/environments/'+e.id,'PATCH',{name:'stale',description:'',expected_version:1})).status,409);
 assert.equal((await api(base+'/environments/'+e.id+'/revisions','POST',{...input,expected_version:2})).data.version,3);
 assert.equal((await api(base+'/toolchains/'+tool.get('id'),'DELETE')).message,'NODE_TOOLCHAIN_REFERENCED');assert.equal((await api(base+'/installations/'+r.get('id'),'DELETE')).message,'RUNTIME_REFERENCED');
 for(const url of ['/catalog','/installations','/toolchains','/diagnostics','/environments','/environments/'+e.id,'/environments/'+e.id+'/revisions','/environments/'+e.id+'/builds','/environments/'+e.id+'/operations'])assert.equal((await api(base+url)).status,200);
 const clone=(await api(base+'/environments/'+e.id+'/clone','POST',{name:'api-clone'})).data;
 for(const id of [e.id,clone.id]){const env=await s.environment(id),operation=await api(base+'/environments/'+id,'DELETE',{expected_version:env.version});assert.equal(operation.status,202);assert.equal(operation.data.language,'NODE');assert.equal((await h.service.wait(operation.data.id)).status,'SUCCESS');assert.equal((await api('/runtime/operations/'+operation.data.id)).data.status,'SUCCESS');assert.equal((await api('/runtime/operations/'+operation.data.id+'/log')).status,200);}
 assert.ok(responses.every(x=>!x.includes('SECRET_SENTINEL')));
});
