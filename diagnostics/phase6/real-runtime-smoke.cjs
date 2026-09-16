// Explicit online gate, never part of deterministic release tests. Uses the production provider.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {runtimeFixture}=require('../../tests/phase6/helpers.cjs');
(async()=>{
 const callbacks=[],h=await runtimeFixture({after:cb=>callbacks.push(cb)},{real:true});
 const result={started_at:new Date().toISOString(),platform:os.type(),architecture:os.arch(),provider_revision:h.provider.revision,fixture:false,operations:[]};
 const destination=path.resolve('diagnostics/phase6/real-smoke');await fs.mkdir(destination,{recursive:true});
 let timer;
 try{
  result.diagnostics=await h.service.diagnostics.inspect();
  timer=setInterval(async()=>{const ops=await h.service.operations();if(ops[0])console.log(JSON.stringify({id:ops[0].id,status:ops[0].status,stage:ops[0].stage}));},15000);
  async function run(type,input){const op=await h.run(type,input);result.operations.push({id:op.id,type,status:op.status,error_code:op.error_code,exit_code:op.exit_code});const Log=h.load('back/services/runtimeLog.ts').default;await fs.copyFile(await h.paths.log(op.id),path.join(destination,`operation-${op.id}.log`));if(op.status!=='SUCCESS')throw Error(type+':'+op.error_code);return op;}
  await run('PROVIDER_INSTALL');result.provider=await h.service.getProvider();
  const version='3.13.15';result.version=version;
  if(process.argv[2]){
   const source=await fs.readFile(process.argv[2]);
   const checksum=require('node:crypto').createHash('sha256').update(source).digest('hex');
   if(checksum!=='1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76')throw Error('Official source checksum mismatch');
   const {RuntimeLease}=h.load('back/services/runtimeProcess.ts'),lease=await RuntimeLease.acquire(h.paths,1);
   try{await fs.writeFile(path.join(await h.paths.cache(),`Python-${version}.tar.xz`),source,{mode:0o600,flag:'wx'});}finally{await lease.release();}
   result.source_cache={preseeded:true,sha256:checksum,source:'https://www.python.org/ftp/python/3.13.15/Python-3.13.15.tar.xz',definition:'pyenv v2.8.5 / 3.13.15'};
  }
  await run('RUNTIME_INSTALL',{version,jobs:4,timeout_seconds:3600});
  const runtime=(await h.service.runtimes())[0];result.runtime=runtime;
  await run('RUNTIME_VERIFY',{runtime_id:runtime.id});
  await run('RUNTIME_REMOVE',{runtime_id:runtime.id});
  result.remaining=(await h.service.runtimes()).length;result.status='PASS';
 }catch(error){result.status='PARTIAL';result.error=error.message;process.exitCode=1;}
 finally{clearInterval(timer);result.finished_at=new Date().toISOString();await fs.writeFile(path.join(destination,'result.json'),JSON.stringify(result,null,2)+'\n');await h.service.close();for(const cb of callbacks.reverse())await cb();console.log(JSON.stringify({status:result.status,error:result.error}));}
})().catch(error=>{console.error(error);process.exitCode=1;});
