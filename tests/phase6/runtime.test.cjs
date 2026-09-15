const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {runtimeFixture}=require('./helpers.cjs');
test('exact catalog filters implementations, prereleases and injection',async t=>{
 const h=await runtimeFixture(t),{parsePythonCatalog}=h.load('back/services/pyenvProvider.ts');
 assert.deepEqual(parsePythonCatalog('3.12.12\n3.13.12\n3.12.12\n3.14.0rc1\npypy3.10\n../x\n3.12\n'),['3.13.12','3.12.12']);
 const {runtimeId,exactPythonVersion}=h.load('back/shared/runtime.ts');for(const x of [true,null,-1,'../1','1.0'])assert.throws(()=>runtimeId(x));for(const x of ['latest','3.12','3.12.12;echo x','/tmp/python'])assert.throws(()=>exactPythonVersion(x));
});
test('provider setup, two runtimes, explicit verify/repair/remove preserve sibling and snapshots',async t=>{
 const h=await runtimeFixture(t);assert.equal((await h.service.getProvider()).state,'UNINITIALIZED');
 assert.equal((await h.run('PROVIDER_INSTALL')).status,'SUCCESS');
 await assert.rejects(h.service.request('RUNTIME_INSTALL',{version:'3.12.99'}),{error_code:'RUNTIME_VERSION_UNAVAILABLE'});
 for(const version of ['3.12.12','3.13.12'])assert.equal((await h.run('RUNTIME_INSTALL',{version})).status,'SUCCESS');
 const rows=await h.service.runtimes();assert.equal(rows.length,2);assert.ok(rows.every(x=>x.health==='HEALTHY'&&x.metadata.disk_usage_bytes>0));
 const row=rows[0],before=row.metadata;
 await assert.rejects(h.service.request('RUNTIME_INSTALL',{version:row.version}),{error_code:'RUNTIME_ALREADY_INSTALLED'});
 assert.equal((await h.run('RUNTIME_VERIFY',{runtime_id:row.id})).status,'SUCCESS');assert.equal((await h.service.runtime(row.id)).metadata.build_timestamp,before.build_timestamp);
 const executable=await h.paths.executable(row.version,row.id);await fs.appendFile(executable.executable,'# changed\n');
 assert.equal((await h.run('RUNTIME_VERIFY',{runtime_id:row.id})).error_code,'RUNTIME_VERIFY_FAILED');
 assert.equal((await h.run('RUNTIME_REPAIR',{runtime_id:row.id})).status,'SUCCESS');
 assert.equal((await h.run('RUNTIME_REMOVE',{runtime_id:row.id})).status,'SUCCESS');assert.equal((await h.service.runtimes()).length,1);
 await assert.rejects(fs.lstat(executable.root),{code:'ENOENT'});
 const Log=h.load('back/services/runtimeLog.ts').default,op=(await h.service.operations())[0];assert.match((await Log.read(h.paths,op.id)).text,/REMOVING/);
});
test('cross-service lock, cancel and timeout keep operation ownership and descendants bounded',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');
 h.provider.install=async ctx=>{await ctx.stage('BUILDING');await ctx.command.run('/bin/sh',['-c','sleep 30 & wait'],ctx.directory,ctx.environment);};
 const op=await h.service.request('RUNTIME_INSTALL',{version:'3.12.12'});
 await assert.rejects(h.service.request('PROVIDER_UPDATE'),{error_code:'RUNTIME_BUSY'});
 await new Promise(r=>setTimeout(r,200));await h.service.cancel(op.id);assert.equal((await h.service.wait(op.id)).status,'CANCELLED');
 const timed=await h.run('RUNTIME_INSTALL',{version:'3.13.12',timeout_seconds:1});assert.equal(timed.error_code,'RUNTIME_TIMEOUT');assert.equal(timed.exit_code,124);
});
test('paths reject unknown roots, version symlink, parent symlink and executable escape',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');
 for(const value of ['../x','/tmp/x','runtime//x','runtime/./x'])await assert.rejects(h.paths.directory(value));
 await fs.symlink('/tmp',path.join(await h.paths.directory('runtime/python/pyenv/versions',true),'3.12.12'));
 await assert.rejects(h.paths.createInstallation('3.12.12',1));
 const root=await h.paths.createInstallation('3.13.12',2);await fs.mkdir(path.join(root,'bin'));await fs.symlink('/usr/bin/python3',path.join(root,'bin/python'));
 await assert.rejects(h.paths.executable('3.13.12',2),{error_code:'RUNTIME_PATH_INVALID'});
});
test('recovery never kills stored PID or adopts unknown versions; reference checks block removal',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');await h.run('RUNTIME_INSTALL',{version:'3.12.12'});const row=(await h.service.runtimes())[0];
 await h.RuntimeOperationModel.create({provider_id:1,runtime_id:row.id,operation_type:'RUNTIME_VERIFY',status:'RUNNING',stage:'VERIFYING',owner_token:'old-owner',owner_pid:process.pid,cancel_requested:false,log_identity:'old-owner',metadata:{}});
 await h.service.recover();assert.equal((await h.service.operations())[0].status,'INTERRUPTED');assert.equal((await h.service.runtime(row.id)).state,'ERROR');
 assert.equal((await h.run('RUNTIME_VERIFY',{runtime_id:row.id})).status,'SUCCESS');
 h.service.references.requireUnused=async()=>{throw new(h.load('back/shared/runtime.ts').RuntimeError)('RUNTIME_REFERENCED');};await assert.rejects(h.service.request('RUNTIME_REMOVE',{runtime_id:row.id}),{error_code:'RUNTIME_REFERENCED'});
 await fs.mkdir(await h.paths.version('3.11.14'));assert.deepEqual((await h.service.filesystemDiagnostics()).orphans,[{version:'3.11.14',state:'ORPHAN'}]);assert.equal((await h.service.runtimes()).length,1);
});
test('build environment excludes backend/user secrets and logs redact split UTF-8 secrets',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');
 const build=await h.load('back/services/runtimeBuildEnvironment.ts').default(h.paths,99,2);
 for(const key of ['JWT_SECRET','PYTHONPATH','PYTHONHOME','GIT_SSH_COMMAND','PYENV_VERSION','NODE_OPTIONS'])assert.equal(build.environment[key],undefined);
 assert.equal(build.environment.PYTHONNOUSERSITE,'1');assert.ok(build.environment.HOME.startsWith(await h.paths.root()));
 const Log=h.load('back/services/runtimeLog.ts').default,log=await Log.open(h.paths,99,build.environment.HOME,{JWT_SECRET:'private-秘密-value'});
 await log.write('hello private-秘');await log.write('密-value UTF-8 中文\n');await log.close();const text=(await Log.read(h.paths,99)).text;assert.doesNotMatch(text,/private-秘密-value/);assert.match(text,/中文/);
});
