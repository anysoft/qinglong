const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {runtimeFixture}=require('./helpers.cjs');
test('real provider validation rejects dirty code, mismatched revision and .git symlink before execution',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');
 const scratch=await h.paths.operation(500),source=path.join(scratch,'source');await fs.mkdir(source);
 const git=(...args)=>execFileSync('git',args,{cwd:source,env:{PATH:'/usr/bin:/bin:/usr/local/bin',HOME:scratch,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},encoding:'utf8',stdio:['ignore','pipe','pipe']});
 git('init','-q');git('config','user.name','fixture');git('config','user.email','fixture@example.invalid');
 for(const relative of ['libexec/pyenv','plugins/python-build/bin/python-build']){await fs.mkdir(path.dirname(path.join(source,relative)),{recursive:true});await fs.writeFile(path.join(source,relative),'#!/bin/sh\necho pyenv 2.8.5\n',{mode:0o700});}
 git('add','.');git('commit','-qm','fixture');const revision=git('rev-parse','HEAD').trim(),target=await h.paths.code(revision,true);await fs.rename(source,target);
 const {RuntimeLease,RuntimeCommand}=h.load('back/services/runtimeProcess.ts'),lease=await RuntimeLease.acquire(h.paths,1);t.after(()=>lease.release());
 const build=await h.load('back/services/runtimeBuildEnvironment.ts').default(h.paths,500,1),ctx={id:500,providerId:1,...build,command:new RuntimeCommand(lease,20,async()=>{}),stage:async()=>{}};
 const Provider=h.load('back/services/pyenvProvider.ts').default,provider=new Provider(h.paths);
 assert.equal(await provider.verifyProvider(ctx,revision),'pyenv 2.8.5');
 await fs.writeFile(path.join(target,'unexpected'),'dirty');await assert.rejects(provider.verifyProvider(ctx,revision),{error_code:'RUNTIME_PROVIDER_INVALID'});await fs.rm(path.join(target,'unexpected'));
 await fs.rename(path.join(target,'.git'),path.join(scratch,'git'));await fs.symlink(path.join(scratch,'git'),path.join(target,'.git'));
 await assert.rejects(provider.verifyProvider(ctx,revision),{error_code:'RUNTIME_PATH_INVALID'});
});
test('unknown nonempty provider root is preserved; symlinked cache reports missing requirement',async t=>{
 const h=await runtimeFixture(t);const directory=await h.paths.directory('runtime/python/pyenv',true);await fs.writeFile(path.join(directory,'user-data'),'keep');
 await assert.rejects(h.paths.provider(true),{error_code:'RUNTIME_RECOVERY_REQUIRED'});assert.equal(await fs.readFile(path.join(directory,'user-data'),'utf8'),'keep');
 await h.paths.directory('cache/runtime',true);await fs.symlink('/tmp',path.join(h.root,'cache/runtime/python'));
 const diagnostics=await h.service.diagnostics.inspect();assert.equal(diagnostics.cache_writable,false);assert.equal(diagnostics.state,'MISSING_REQUIREMENT');
});
test('fixed interpreter diagnostic rejects incorrect version and prefix even on first installation',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');await h.run('RUNTIME_INSTALL',{version:'3.12.12'});const row=(await h.service.runtimes())[0];const {root,executable}=await h.paths.executable(row.version,row.id);
 const {RuntimeLease,RuntimeCommand}=h.load('back/services/runtimeProcess.ts'),lease=await RuntimeLease.acquire(h.paths,1);t.after(()=>lease.release());const build=await h.load('back/services/runtimeBuildEnvironment.ts').default(h.paths,88,1),ctx={id:88,providerId:1,...build,command:new RuntimeCommand(lease,20,async()=>{}),stage:async()=>{}};
 for(const patch of [{version:[3,12,99]},{prefix:'/tmp'},{implementation:'PyPy'}]){
  const metadata={executable,version:[3,12,12],prefix:root,base_prefix:root,implementation:'CPython',...patch};await fs.writeFile(executable,'#!/bin/sh\nprintf \'%s\\n\' '+"'"+JSON.stringify(metadata)+"'"+'\n',{mode:0o700});
  await assert.rejects(h.provider.verify(ctx,row,true),{error_code:'RUNTIME_VERIFY_FAILED'});
 }
});
