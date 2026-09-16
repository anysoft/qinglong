const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {attach}=require('../phase10/attach.cjs'),{task,wait}=require('../phase10/helpers.cjs'),{wheelhouse}=require('../phase7/wheelhouse.cjs');
const manifest=require('../../diagnostics/phase13/managed-runtime/result.json');
test('official managed Python imports from pinned venv across retry and Build promotion, without host dependency paths',async t=>{
 assert.equal(manifest.status,'PASS');const h=await attach(manifest.root),index=await wheelhouse(path.join(h.root,'phase10-wheelhouse'));
 const Operations=h.load('back/services/runtimeOperations.ts').default,Provider=h.load('back/services/pyenvProvider.ts').default,Paths=h.load('back/services/runtimePaths.ts').default,Resolver=h.load('back/services/executionResolver.ts').default,Execution=h.load('back/services/executionService.ts').default;
 const ops=new Operations(new Provider(new Paths(h.root)),undefined,index.index);h.execution=new Execution(h.paths,new Resolver(ops,h.paths));h.taskService=new(h.load('back/services/task.ts').default)();
 t.after(async()=>{await h.execution.stop();await ops.close();await index.close();await h.close();});
 const service=new(h.load('back/services/pythonEnvironment.ts').default)(ops),runtime=(await ops.runtimes()).find(row=>row.state==='READY');
 let environment=await service.create({name:'phase10 python '+Date.now(),runtime_id:runtime.id,requirements:['ql-phase7-root==1.0.0']});
 async function build(){environment=await service.environment(environment.id);const op=await ops.request('PYTHON_ENV_BUILD',{environment:{environment_id:environment.id,expected_version:environment.version},timeout_seconds:120});assert.equal((await ops.wait(op.id)).status,'SUCCESS');environment=await service.environment(environment.id);return environment.current_build_id;}
 const first=await build();
 const f=await task(h,'import sys, os, pathlib, ql_phase7_root\nprint(ql_phase7_root.__version__)\nprint(sys.executable)\nprint(sys.argv[1])\nprint(os.environ.get("PYTHONPATH", "NO_HOST_PATH"))\np=pathlib.Path("once")\nif not p.exists():\n p.write_text("yes")\n sys.exit(3)\n',{max_attempts:2,initial_delay_seconds:8},{entry:'main.py',language:'PYTHON',arguments:['literal $TOKEN'],runtime:{kind:'PYTHON',python_environment_id:environment.id,node_environment_id:null}});
 await h.TaskEnvVariableModel.create({task_id:f.definition.id,name:'PYTHONPATH',value:'/unsafe/host/deps',operation:'SET',status:'enabled'});
 const run=await h.execution.submit(f.definition.id);await h.execution.tick();
 for(let i=0;i<150;i++){if(await h.TaskRunAttemptModel.count({where:{task_run_id:run.id,status:'FAILED'}}))break;await new Promise(r=>setTimeout(r,30));}
 const current=await service.environment(environment.id);await service.revise(environment.id,{runtime_id:runtime.id,requirements:['ql-phase7-root==2.0.0'],expected_version:current.version});const second=await build();assert.notEqual(first,second);
 const final=await wait(h,run.id,30000);assert.equal(final.status,'SUCCESS',JSON.stringify(final));assert.equal(final.snapshot_metadata.build_id,first);const log=await h.execution.log(run.id);assert.equal(log.split('1.0.0').length-1,2);assert.ok(log.includes('/venv/bin/python'));assert.ok(log.includes('literal $TOKEN'));assert.ok(log.includes('NO_HOST_PATH'));assert.ok(!log.includes('/unsafe/host/deps'));
 const next=await wait(h,(await h.execution.submit(f.definition.id)).id);assert.equal(next.status,'SUCCESS');assert.equal(next.snapshot_metadata.build_id,second);assert.ok((await h.execution.log(next.id)).includes('2.0.0'));
 await require('../phase10/managed-entrypoints.cjs')(h,f.definition);
 const slow=await task(h,'import time; time.sleep(30)',{timeout_seconds:1},{entry:'slow.py',language:'PYTHON',runtime:{kind:'PYTHON',python_environment_id:environment.id,node_environment_id:null}});assert.equal((await wait(h,(await h.execution.submit(slow.definition.id)).id)).status,'TIMEOUT');const cancel=await h.execution.submit(slow.definition.id);await h.execution.tick();await new Promise(r=>setTimeout(r,200));await h.execution.cancel(cancel.id);assert.equal((await wait(h,cancel.id)).status,'CANCELLED');
 await fs.writeFile('diagnostics/phase13/managed-python-execution.json',JSON.stringify({status:'PASS',runtime:runtime.version,pinned_build:first,promoted_build:second,real_venv_import:true,scheduled:true,timeout:true,cancel:true,retry_snapshot:true,host_path_excluded:true},null,2));
});
