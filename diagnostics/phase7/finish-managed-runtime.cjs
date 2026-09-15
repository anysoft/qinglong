const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const manifest=require('./managed-runtime/result.json'),{attach}=require('../../tests/phase7/managed-helper.cjs');
(async()=>{
 if(!manifest.managed||manifest.fixture_provider!==false||!/^platform-phase5-[a-zA-Z0-9]+$/.test(path.basename(manifest.root))||await fs.realpath(path.dirname(manifest.root))!==await fs.realpath(os.tmpdir()))throw Error('Not phase-owned fixture');
 const h=await attach(manifest.root),result={started_at:new Date().toISOString(),operations:[]};
 try{
  if(await h.PythonEnvironmentModel.count())throw Error('Environments still exist');
  result.references=await h.operations.references.inspect(manifest.runtime.id);if(result.references.count)throw Error('References remain');
  for(const type of ['RUNTIME_VERIFY','RUNTIME_REMOVE']){const queued=await h.operations.request(type,{runtime_id:manifest.runtime.id}),op=await h.operations.wait(queued.id);result.operations.push({id:op.id,type,status:op.status,exit_code:op.exit_code,error_code:op.error_code});if(op.status!=='SUCCESS')throw Error(type+':'+op.error_code);}
  result.remaining=(await h.operations.runtimes()).length;result.status='PASS';
  await fs.cp(path.join(manifest.root,'log/runtime'),path.join(__dirname,'real-operation-logs'),{recursive:true});
  await fs.writeFile(path.join(__dirname,'real-operation-history.json'),JSON.stringify((await h.operations.operations()).map(({id,operation_type,status,stage,error_code,exit_code,metadata})=>({id,operation_type,status,stage,error_code,exit_code,environment_id:metadata.environment_id,build_id:metadata.build_id})),null,2)+'\n');
 }finally{await h.close();}
 await fs.rm(manifest.root,{recursive:true,force:false});result.fixture_removed=true;result.finished_at=new Date().toISOString();await fs.writeFile(path.join(__dirname,'runtime-final-lifecycle.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e);process.exitCode=1;});
