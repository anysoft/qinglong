const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {attach}=require('../../tests/phase8/managed-helper.cjs');
(async()=>{
 const file=path.join(__dirname,'managed-runtime/result.json'),result=JSON.parse(await fs.readFile(file,'utf8'));
 assert.equal(result.root,'/var/folders/zw/3r78x0_95dl5_cj7tpslfdq40000gn/T/platform-phase5-trrS0Y');
 await fs.copyFile(file,path.join(__dirname,'managed-runtime/slow-download-attempt.json'));
 const h=await attach(result.root);let timer;
 try {
 const data=await fs.readFile('/tmp/phase12-Python-3.13.15-verified.tar.xz');assert.equal(require('node:crypto').createHash('sha256').update(data).digest('hex'),'1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76');
 await fs.writeFile(path.join(await h.operations.paths.cache(),'Python-3.13.15.tar.xz'),data,{flag:'wx',mode:0o600});
 async function run(type,input){const op=await h.operations.request(type,input),done=await h.operations.wait(op.id);await fs.copyFile(await h.operations.paths.log(op.id),path.join(__dirname,'managed-runtime','operation-'+op.id+'.log'));assert.equal(done.status,'SUCCESS',JSON.stringify(done));return done;}
 for(const runtime of await h.operations.runtimes())await run('RUNTIME_REMOVE',{runtime_id:runtime.id});
 timer=setInterval(async()=>{const op=(await h.operations.operations())[0];console.log(JSON.stringify(op&&{id:op.id,status:op.status,stage:op.stage}));},15000);
 await run('RUNTIME_INSTALL',{version:'3.13.15',jobs:4,timeout_seconds:3600});result.runtime=(await h.operations.runtimes())[0];result.provider=await h.operations.getProvider();result.status='PASS';delete result.error;result.download_recovery='Official HTTPS range download, pinned SHA256 verified; failed install removed through RuntimeOperations before retry.';
 }catch(e){result.status='FAIL';result.error=e.message;process.exitCode=1;}finally{clearInterval(timer);await h.close();result.finished_at=new Date().toISOString();await fs.writeFile(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,error:result.error}));}
})().catch(e=>{console.error(e);process.exitCode=1;});
