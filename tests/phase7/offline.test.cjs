const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{fork,execFileSync}=require('node:child_process');
const {attach,treeDigest}=require('./managed-helper.cjs'),{wheelhouse}=require('./wheelhouse.cjs');
const source=process.env.QL_PHASE7_MANAGED_ROOT||require('../../diagnostics/phase7/managed-runtime/result.json').root;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,seconds=20){const end=Date.now()+seconds*1000;while(Date.now()<end){const result=await fn();if(result)return result;await sleep(100);}throw Error('Condition timeout');}
test('OFFLINE managed CPython: real venv/pip, immutable builds, leases, rollback, failure, cancel, crash, isolation and safe deletion', {timeout:240000},async t=>{
 const index=await wheelhouse(path.join(source,'phase7-wheelhouse'));t.after(()=>index.close());const h=await attach(source,index.index);t.after(()=>h.close());
 const runtime=(await h.operations.runtimes()).find(x=>x.state==='READY');assert.ok(runtime);const runtimeRoot=(await h.paths.executable(runtime.version,runtime.id,runtime.provider_id)).root;
 const before=await treeDigest(runtimeRoot);let env=await h.service.create({name:'phase7-offline-'+Date.now(),runtime_id:runtime.id,requirements:['ql-phase7-root==1.0.0']});const id=env.id;
 const run=async(type,build_id,status='SUCCESS',timeout=60)=>{const current=await h.service.environment(id),op=await h.operations.request(type,{environment:{environment_id:id,build_id,expected_version:current.version},timeout_seconds:timeout});const result=await h.operations.wait(op.id);assert.equal(result.status,status,JSON.stringify(result));return result;};
 const revise=async requirements=>{const current=await h.service.environment(id);return h.service.revise(id,{runtime_id:runtime.id,requirements,expected_version:current.version});};
 assert.equal((await h.operations.references.inspect(runtime.id)).count>=2,true);
 await assert.rejects(h.operations.request('RUNTIME_REMOVE',{runtime_id:runtime.id}),{error_code:'RUNTIME_REFERENCED'});
 for(const spec of ['requests; touch /tmp/pwned','foo$(id)','`id`','--index-url evil','-r file','-e .','foo\nbar','/tmp/pkg','pkg @ git+https://example.com/x','requests @ https://u:secret@host/file']) await assert.rejects(revise([spec]),{error_code:'PYTHON_REQUIREMENT_INVALID'});
 await assert.rejects(revise(['Foo_Bar==1','foo-bar==2']),{error_code:'PYTHON_REQUIREMENT_INVALID'});
 await h.service.withMutation(id,async ctx=>{const r=await h.service.healthyRuntime(runtime.id),parsed=await h.service.dependencies.parse(ctx,r.executable,['httpx[http2]>=0.27,<0.29','platformdirs; python_version >= "3.12"']);assert.equal(parsed[0].normalized_name,'httpx');assert.equal(parsed[1].normalized_name,'platformdirs');});
 await run('PYTHON_ENV_BUILD');env=await h.service.environment(id);const first=await h.service.build(id,env.current_build_id);assert.equal(first.state,'READY');assert.equal(first.resolved.find(x=>x.name==='ql-phase7-root').direct,true);assert.equal(first.resolved.find(x=>x.name==='ql-phase7-leaf').direct,false);assert.match(first.freeze,/ql-phase7-leaf==1.0.0/);
 const Resolver=h.load('back/services/pythonEnvironmentResolver.ts').default,pinned=await new Resolver(h.operations).resolve(id);assert.ok(path.isAbsolute(pinned.snapshot.python_executable));assert.ok(Object.isFrozen(pinned.snapshot));
 const secondPin=await new Resolver(h.operations).resolve(id);await secondPin.lease.release();
 await h.RuntimeInstallationModel.update({metadata:{...runtime.metadata,executable_sha256:'mismatch'}},{where:{id:runtime.id}});await assert.rejects(new Resolver(h.operations).resolve(id),{error_code:'PYTHON_ENV_RUNTIME_INVALID'});await h.RuntimeInstallationModel.update({metadata:runtime.metadata},{where:{id:runtime.id}});
 assert.equal(execFileSync(pinned.snapshot.python_executable,['-I','-B','-c','import ql_phase7_root; print(ql_phase7_root.__version__)'],{encoding:'utf8'}).trim(),'1.0.0');
 const firstHash=await treeDigest(path.dirname(pinned.snapshot.venv_root));
 await revise(['ql-phase7-root==2.0.0']);await run('PYTHON_ENV_BUILD');env=await h.service.environment(id);const second=await h.service.build(id,env.current_build_id);assert.notEqual(second.id,first.id);assert.equal(pinned.snapshot.build_id,first.id);assert.equal(await treeDigest(path.dirname(pinned.snapshot.venv_root)),firstHash);
 const diff=await h.service.diff(id,first.id,second.id);assert.equal(diff.changed.length,2);
 await assert.rejects(run('PYTHON_ENV_DELETE_BUILD',first.id),{error_code:'PYTHON_ENV_BUSY'});
 await assert.rejects(run('PYTHON_ENV_DELETE'),{error_code:'PYTHON_ENV_BUSY'});
 await pinned.lease.release();await run('PYTHON_ENV_PROMOTE',first.id);assert.equal((await h.service.environment(id)).current_build_id,first.id);assert.equal(await treeDigest(path.dirname(pinned.snapshot.venv_root)),firstHash);
 await run('PYTHON_ENV_VERIFY',first.id);await run('PYTHON_ENV_DELETE_BUILD',second.id);
 await revise(['ql-phase7-root==1.0.0','ql-phase7-leaf==2.0.0']);await run('PYTHON_ENV_BUILD',undefined,'FAILED');assert.equal((await h.service.environment(id)).current_build_id,first.id);
 await revise(['ql-phase7-fail==1.0.0']);await run('PYTHON_ENV_BUILD',undefined,'FAILED');assert.equal((await h.service.environment(id)).current_build_id,first.id);
 await revise(['ql-phase7-slow==1.0.0']);env=await h.service.environment(id);const slow=await h.operations.request('PYTHON_ENV_BUILD',{environment:{environment_id:id,expected_version:env.version},timeout_seconds:120});
 const gone=pid=>{try{return !execFileSync('/bin/ps',['-o','stat=','-p',String(pid)],{encoding:'utf8'}).trim().replace(/^Z.*/, '');}catch{return true;}};
 const Log=h.load('back/services/runtimeLog.ts').default;await until(async()=>((await Log.read(h.paths,slow.id)).text??'').includes('PHASE7_SLOW_READY'),30);
 await assert.rejects(h.operations.request('RUNTIME_VERIFY',{runtime_id:runtime.id}),{error_code:'RUNTIME_BUSY'});await assert.rejects(h.operations.request('PROVIDER_UPDATE'),{error_code:'RUNTIME_BUSY'});
 const slowChild=Number((await Log.read(h.paths,slow.id)).text.match(/PHASE7_SLOW_CHILD:(\d+)/)[1]);
 await h.operations.cancel(slow.id);assert.equal((await h.operations.wait(slow.id)).status,'CANCELLED');await until(()=>gone(slowChild));assert.equal((await h.service.environment(id)).current_build_id,first.id);
 // Real backend loss; supervisor EOF retains provider FD until descendants finish, then reconciliation is allowed.
 const worker=fork(path.join(__dirname,'crash-worker.cjs'),[source,index.index,String(id)],{stdio:['ignore','pipe','pipe','ipc']});let workerError='';worker.stderr.on('data',x=>workerError+=x);const crashId=await new Promise((resolve,reject)=>{worker.once('message',x=>resolve(x.id));worker.once('exit',code=>reject(Error('Worker exited '+code+workerError)));});
 await until(async()=>((await Log.read(h.paths,crashId)).text??'').includes('PHASE7_SLOW_READY'),30);const crashChild=Number((await Log.read(h.paths,crashId)).text.match(/PHASE7_SLOW_CHILD:(\d+)/)[1]);worker.kill('SIGKILL');await new Promise(r=>worker.once('exit',r));
 await until(async()=>{await h.operations.recover();return (await h.operations.operation(crashId)).status==='INTERRUPTED';},20);await until(()=>gone(crashChild));assert.equal((await h.service.environment(id)).current_build_id,first.id);
 await revise(['ql-phase7-root==2.0.0']);await run('PYTHON_ENV_REBUILD');env=await h.service.environment(id);const last=env.current_build_id;
 const clone=await h.service.clone(id,'phase7-clone-'+Date.now());const cloneOp=await h.operations.request('PYTHON_ENV_BUILD',{environment:{environment_id:clone.id,expected_version:clone.version},timeout_seconds:60});assert.equal((await h.operations.wait(cloneOp.id)).status,'SUCCESS');
 const cloneResolved=await new Resolver(h.operations).resolve(clone.id),lastResolved=await new Resolver(h.operations).resolve(id);assert.notEqual(cloneResolved.snapshot.venv_root,lastResolved.snapshot.venv_root);await lastResolved.lease.release();await cloneResolved.lease.release();
 // Close/reopen preserves definitions/current/resolved history; do not infer success from leftover folders.
 await h.close();const fresh=await attach(source,index.index);t.after(()=>fresh.close());assert.equal((await fresh.service.environment(id)).current_build_id,last);assert.equal((await fresh.service.build(id,last)).resolved.length>=3,true);
 const snapshot=await new (fresh.load('back/services/pythonEnvironmentResolver.ts').default)(fresh.operations).resolve(id);await snapshot.lease.release();
 for(const target of [id,clone.id]){const current=await fresh.service.environment(target);const op=await fresh.operations.request('PYTHON_ENV_DELETE',{environment:{environment_id:target,expected_version:current.version}});assert.equal((await fresh.operations.wait(op.id)).status,'SUCCESS');}
 assert.equal((await fresh.operations.references.inspect(runtime.id)).count,0);assert.equal(await treeDigest(runtimeRoot),before,'Environment operations mutated the base Runtime');
 assert.ok((await fs.stat(await fresh.operations.environments.paths.cache())).isDirectory());assert.ok(index.requests.some(x=>x.includes('/artifacts/')));
 await fs.writeFile(path.resolve('diagnostics/phase7/offline-result.json'),JSON.stringify({status:'PASS',runtime_id:runtime.id,version:runtime.version,first_build:first.id,last_build:last,requests:index.requests.length,runtime_sha256:before,package_source:'loopback deterministic wheelhouse',finished_at:new Date().toISOString()},null,2)+'\n');
});
