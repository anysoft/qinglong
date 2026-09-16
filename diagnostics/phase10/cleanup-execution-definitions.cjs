const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {attach}=require('../../tests/phase10/attach.cjs');
(async()=>{for(const file of ['managed-node/result.json','managed-runtime/result.json']){
 const manifest=require('./'+file);assert.equal(manifest.status,'PASS');assert.match(manifest.root,/\/platform-phase5-[A-Za-z0-9]+$/);const stat=await fs.lstat(manifest.root);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink());
 const h=await attach(manifest.root);try{await h.execution.stop();assert.equal(await h.TaskRunModel.count({where:{status:['QUEUED','RESOLVING','RUNNING','RECOVERY_REQUIRED']}}),0);await h.TaskModel.destroy({where:{}});
 const ops=h.execution.resolver.operations;
 for(const environment of await ops.node.environments()){const op=await ops.request('NODE_ENV_DELETE',{node:{environment_id:environment.id,expected_version:environment.version}});assert.equal((await ops.wait(op.id)).status,'SUCCESS');}
 const Py=h.load('back/services/pythonEnvironment.ts').default,py=new Py(ops);for(const environment of await py.list()){const current=await py.environment(environment.id),op=await ops.request('PYTHON_ENV_DELETE',{environment:{environment_id:current.id,expected_version:current.version}});assert.equal((await ops.wait(op.id)).status,'SUCCESS');}
 await ops.close();console.log(file,'execution fixtures released');
 }finally{await h.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
