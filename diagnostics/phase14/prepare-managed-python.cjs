// Online setup only. Retain this owned test fixture for subsequent OFFLINE venv/pip gates.
const fs=require('node:fs/promises'),path=require('node:path');
const {runtimeFixture}=require('../../tests/phase6/helpers.cjs');
(async()=>{
 const callbacks=[],h=await runtimeFixture({after:f=>callbacks.push(f)},{real:true});
 const result={root:h.root,managed:true,fixture_provider:false,version:'3.13.15',started_at:new Date().toISOString()};
 const destination=path.resolve('diagnostics/phase14/managed-runtime');await fs.mkdir(destination,{recursive:true});
 let timer;try{
 timer=setInterval(async()=>{const op=(await h.service.operations())[0];console.log(JSON.stringify(op&&{id:op.id,status:op.status,stage:op.stage}));},15000);
 async function run(type,input){const op=await h.run(type,input);await fs.copyFile(await h.paths.log(op.id),path.join(destination,'operation-'+op.id+'.log'));if(op.status!=='SUCCESS')throw Error(type+':'+op.error_code);return op;}
 await run('PROVIDER_INSTALL');
 if(process.argv[2]){const data=await fs.readFile(process.argv[2]);if(require('node:crypto').createHash('sha256').update(data).digest('hex')!=='1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76')throw Error('Source checksum');await fs.writeFile(path.join(await h.paths.cache(),'Python-3.13.15.tar.xz'),data,{flag:'wx',mode:0o600});}
 await run('RUNTIME_INSTALL',{version:'3.13.15',jobs:4,timeout_seconds:3600});result.runtime=(await h.service.runtimes())[0];result.provider=await h.service.getProvider();result.status='PASS';
 }catch(e){result.status='FAIL';result.error=e.message;process.exitCode=1;}finally{clearInterval(timer);await h.service.close();await h.db.close();result.finished_at=new Date().toISOString();await fs.writeFile(path.join(destination,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
})().catch(e=>{console.error(e);process.exitCode=1;});
