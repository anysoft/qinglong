const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{fork}=require('node:child_process');
const {runtimeFixture}=require('./helpers.cjs');
async function until(fn){const end=Date.now()+12000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('condition timed out');}
test('backend SIGKILL retains inherited provider lease until supervised descendants exit, then recovery succeeds',{timeout:20000},async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');
 const worker=fork(path.join(__dirname,'crash-worker.cjs'),[h.root],{stdio:['ignore','pipe','pipe','ipc']});t.after(()=>{if(worker.exitCode===null)worker.kill('SIGKILL');});
 let error='';worker.stderr.on('data',x=>error+=x);await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('exit',code=>reject(Error('worker exited '+code+' '+error)));});
 const marker=path.join(h.root,'tmp/runtime/python/operation-777/descendant.pid');await until(()=>fs.stat(marker).then(()=>true,()=>false));const pid=Number(await fs.readFile(marker,'utf8'));
 await h.RuntimeOperationModel.create({provider_id:1,operation_type:'PROVIDER_VERIFY',status:'RUNNING',stage:'TEST',owner_token:'worker',owner_pid:worker.pid,cancel_requested:false,log_identity:'worker',metadata:{}});
 await h.service.recover();assert.equal((await h.service.operations())[0].status,'RUNNING');
 await assert.rejects(h.service.request('PROVIDER_UPDATE'),{error_code:'RUNTIME_BUSY'});
 worker.kill('SIGKILL');await until(async()=>{try{process.kill(pid,0);return false;}catch(e){return e.code==='ESRCH';}});
 await until(async()=>{await h.service.recover();return (await h.service.operations())[0].status==='INTERRUPTED';});
 assert.equal((await h.run('PROVIDER_VERIFY')).status,'SUCCESS');
});
test('partial remove failure retains record and ownership for retry; provider failure preserves interpreter',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');await h.run('RUNTIME_INSTALL',{version:'3.12.12'});const row=(await h.service.runtimes())[0];
 const original=h.provider.uninstall.bind(h.provider);h.provider.uninstall=async(ctx,runtime)=>{const root=await h.paths.assertInstallation(runtime.version,runtime.id);await fs.rm(path.join(root,'bin'),{recursive:true});throw Object.assign(Error('private build error'),{code:'EACCES'});};
 assert.equal((await h.run('RUNTIME_REMOVE',{runtime_id:row.id})).status,'FAILED');assert.equal((await h.service.runtime(row.id)).state,'ERROR');await h.paths.assertInstallation(row.version,row.id);
 h.provider.uninstall=original;assert.equal((await h.run('RUNTIME_REMOVE',{runtime_id:row.id})).status,'SUCCESS');
 await h.run('RUNTIME_INSTALL',{version:'3.13.12'});const sibling=(await h.service.runtimes())[0];h.provider.setup=async()=>{throw Error('secret network failure');};
 assert.equal((await h.run('PROVIDER_UPDATE')).status,'FAILED');assert.equal((await h.run('RUNTIME_VERIFY',{runtime_id:sibling.id})).status,'SUCCESS');
});
test('disk full and command failures produce bounded static errors and leave partial runtime repairable',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');
 h.provider.install=async(ctx,runtime)=>{await h.paths.createInstallation(runtime.version,runtime.id);throw Object.assign(Error('SECRET_DISK_PATH'),{code:'ENOSPC'});};
 const failed=await h.run('RUNTIME_INSTALL',{version:'3.12.12'});assert.equal(failed.status,'FAILED');assert.doesNotMatch(JSON.stringify(failed),/SECRET_DISK_PATH/);assert.equal((await h.service.runtimes())[0].state,'ERROR');
 h.provider.install=async ctx=>{await ctx.command.run('/bin/sh',['-c','exit 17'],ctx.directory,ctx.environment);};
 const exited=await h.run('RUNTIME_INSTALL',{version:'3.13.12'});assert.equal(exited.exit_code,17);assert.equal(exited.error_code,'RUNTIME_COMMAND_FAILED');
});
test('bounded runtime logs drain oversized output without exposing private HOME or symlink targets',async t=>{
 const h=await runtimeFixture(t);await h.run('PROVIDER_INSTALL');const Log=h.load('back/services/runtimeLog.ts').default;
 const log=await Log.open(h.paths,99,'/private/runtime-home',{BACKEND_TOKEN:'SECRET_LOG_VALUE'});
 for(let i=0;i<20;i++)await log.write('x'.repeat(1024*1024));await log.write('/private/runtime-home SECRET_LOG_VALUE');await log.close();
 const out=await Log.read(h.paths,99);assert.ok(out.size<=16*1024*1024+100);assert.ok(out.truncated);assert.match(out.text,/RUNTIME_LOG_TRUNCATED/);assert.doesNotMatch(out.text,/SECRET_LOG_VALUE|private\/runtime-home/);
 const target=await h.paths.log(100);await fs.symlink('/etc/passwd',target);await assert.rejects(Log.read(h.paths,100),{error_code:'RUNTIME_LOG_UNAVAILABLE'});
});
