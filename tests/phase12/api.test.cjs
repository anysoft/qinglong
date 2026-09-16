const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),express=require('express'),{Container}=require('typedi');
const load=require('../../test/helpers/load-security-module.cjs');
class WorkspaceToken{}
const routes=load(path.resolve('back/api/codeWorkspace.ts'),{'../services/codeWorkspace':{__esModule:true,default:WorkspaceToken}}).default;
test('Panel workspace routes reject Open access, unknown fields, absent concurrency tokens and unsafe error output',async t=>{
 let calls=0;Container.set(WorkspaceToken,{info:async()=>({id:1}),mutate:async()=>{calls++;throw Object.assign(new Error('/private/secret/path token=canary'),{error_code:'WORKSPACE_FILE_CONFLICT',status:409});}});
 const app=express(),router=express.Router();app.use(express.json());routes(router);app.use('/api',router);app.use('/open',router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>{Container.remove(WorkspaceToken);return new Promise(r=>server.close(r));});const base='http://127.0.0.1:'+server.address().port;
 async function request(url,method='GET',body){const response=await fetch(base+url,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
 assert.equal((await request('/open/workspaces/1')).status,403);assert.equal((await request('/api/workspaces/1/files','PUT',{path:'file',content:'x'})).status,400);assert.equal((await request('/api/workspaces/1/files','POST',{path:'file',content:'x',must_not_exist:false})).status,400);assert.equal((await request('/api/workspaces/1/files','PUT',{path:'file',content:'x',expected_hash:'a'.repeat(64),absolute_path:'/etc/passwd'})).status,400);assert.equal(calls,0);
 const conflict=await request('/api/workspaces/1/files','PUT',{path:'file',content:'x',expected_hash:'a'.repeat(64)});assert.equal(conflict.status,409);assert.equal(conflict.body.error_code,'WORKSPACE_FILE_CONFLICT');assert.doesNotMatch(JSON.stringify(conflict),/secret|private|canary/);
 const retired=express.Router();load(path.resolve('back/api/script.ts')).default(retired);app.use('/legacy',retired);for(const method of ['GET','PUT','POST','DELETE'])assert.equal((await request('/legacy/scripts/detail',method,method==='GET'?undefined:{})).status,410);
});
