const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture,task,wait}=require('./helpers.cjs');
test('attempt timing stays ordered when the wall clock moves backwards',async t=>{
 const h=await fixture(t),{executionTiming}=h.load('back/services/executionAttemptCoordinator.ts');
 const timing=executionTiming(Date.parse('2026-09-17T16:18:05.980Z'),1000,1000.4);
 assert.equal(timing.duration,0);assert.equal(timing.finishedAt,'2026-09-17T16:18:05.980Z');
});
async function hook(h,id,command,phase='BEFORE'){return h.TaskHookModel.create({task_id:id,name:'test '+phase,phase,command,cwd_base:'TASK_CWD',position:1,timeout_seconds:5,failure_policy:'FAIL_EXECUTION',enabled:true});}
async function attempted(h,id){for(let i=0;i<200;i++){if(await h.TaskRunAttemptModel.count({where:{task_run_id:id,status:'FAILED'}}))return;await new Promise(r=>setTimeout(r,20));}throw Error('No failed attempt');}
test('retry resets BEFORE patches, freezes Config and Hooks, keeps run-wide secrets, removes private Hook files',async t=>{
 const h=await fixture(t),f=await task(h,'cat config.txt; printf "TOKEN:%s\\n" "${TOKEN-unset}"; if [ ! -f once ]; then touch once; exit 7; fi',{max_attempts:2,initial_delay_seconds:1});
 const assets=new(h.load('back/services/configAsset.ts').default)(),asset=await assets.save({name:'snapshot config',is_secret:false,content:'original-config'});
 await new(h.load('back/services/taskConfig.ts').default)().save('task',f.definition.id,{asset_id:asset.id,operation:'ATTACH',target_base:'WORKSPACE_ROOT',target_path:'config.txt',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,enabled:true});
 const before=await hook(h,f.definition.id,'echo original-hook; if [ ! -f once ]; then printf \'{"environment":{"set":{"TOKEN":"first-attempt-secret"},"secret":["TOKEN"]}}\' > "$PLATFORM_HOOK_OUTPUT"; else printf first-attempt-secret; fi');
 const run=await h.execution.submit(f.definition.id);await h.execution.tick();await attempted(h,run.id);
 await before.update({command:'echo edited-hook',version:before.version+1});await assets.save({id:asset.id,name:asset.name,is_secret:false,content:'edited-config',expected_version:asset.version});
 const final=await wait(h,run.id);assert.equal(final.status,'SUCCESS',JSON.stringify(final));const log=await h.execution.log(run.id);assert.equal(log.split('original-config').length-1,2);assert.equal(log.split('original-hook').length-1,2);assert.ok(log.includes('TOKEN:unset'));assert.doesNotMatch(log,/edited-|first-attempt-secret/);await assert.rejects(fs.lstat(path.join(h.root,'tmp/execution/run-'+run.id)),{code:'ENOENT'});
});
test('invalid Hook output never retries; FINALLY executes and private files are removed',async t=>{
 const h=await fixture(t),f=await task(h,'touch MAIN_RAN',{max_attempts:3});await hook(h,f.definition.id,'printf invalid-json > "$PLATFORM_HOOK_OUTPUT"');await hook(h,f.definition.id,'echo finally-marker','FINALLY');
 const run=await h.execution.submit(f.definition.id),result=await wait(h,run.id);assert.equal(result.status,'FAILED');assert.equal(result.attempt_count,1);assert.ok((await h.execution.log(run.id)).includes('finally-marker'));await assert.rejects(fs.stat(path.join(f.root,'MAIN_RAN')),{code:'ENOENT'});await assert.rejects(fs.lstat(path.join(h.root,'tmp/execution/run-'+run.id)),{code:'ENOENT'});
});
test('pre-resolution, skipped and queued cancelled runs persist canonical results',async t=>{
 const h=await fixture(t),f=await task(h,'exit 0');const a=await h.execution.submit(f.definition.id),b=await h.execution.submit(f.definition.id);assert.equal(b.result.status,'SKIPPED');await h.execution.cancel(a.id);assert.equal((await h.execution.get(a.id)).result.cancelled,true);
 await fs.unlink(path.join(f.root,'main.sh'));const c=await wait(h,(await h.execution.submit(f.definition.id)).id);assert.equal(c.status,'FAILED');assert.equal(c.attempt_count,0);assert.equal(c.result.status,c.status);assert.equal(c.result.primaryError.phase,'RESOLVE');
});
test('node binding rejects imported sibling module trees and preserves unknown replacement on recovery',async t=>{
 const h=await fixture(t),f=await task(h,'exit 0'),Binding=h.load('back/services/executionNodeBinding.ts').default,binding=new Binding(h.paths);
 const lease=await h.paths.worktree(f.worktree.id);t.after(()=>lease.release());const materialization=h.paths.materializationLease(f.worktree.id,lease);
 const destination=path.join(h.root,'fake-build/node_modules');await fs.mkdir(destination,{recursive:true});const context={source:{worktreeId:f.worktree.id},workspace:{workspaceRoot:f.root,taskDir:f.root},runtime:{nodeModulesRoot:destination}};
 await fs.mkdir(path.join(f.root,'imported/node_modules'),{recursive:true});await assert.rejects(binding.prepare(context,materialization),/NODE_MODULES_CONFLICT/);await fs.rmdir(path.join(f.root,'imported/node_modules'));
 const installed=await binding.prepare(context,materialization);assert.equal(await fs.readlink(path.join(f.root,'node_modules')),destination);await fs.unlink(path.join(f.root,'node_modules'));await fs.mkdir(path.join(f.root,'node_modules'));await fs.writeFile(path.join(f.root,'node_modules/user'),'preserve');
 await assert.rejects(installed.cleanup(),/NODE_BINDING_RECOVERY_REQUIRED/);assert.equal(await fs.readFile(path.join(f.root,'node_modules/user'),'utf8'),'preserve');
 await fs.unlink(path.join(f.root,'node_modules/user'));await fs.rmdir(path.join(f.root,'node_modules'));await binding.recover(f.worktree.id,f.root,materialization);
});
test('private cleanup fails closed on unknown file and preserves that file',async t=>{
 const h=await fixture(t),f=await task(h,'exit 0'),run=await h.execution.submit(f.definition.id);const lease=await h.paths.owner(run.id);t.after(()=>lease.release());const directory=await h.paths.attemptDirectory(run.id,1);await fs.writeFile(path.join(directory,'user-file'),'preserve');await assert.rejects(h.paths.cleanupRunDirectory(run.id),/EXECUTION_TEMP_RECOVERY_REQUIRED/);assert.equal(await fs.readFile(path.join(directory,'user-file'),'utf8'),'preserve');await h.execution.cancel(run.id);
});
test('execution terminal result queues durable notification without synchronous provider calls',async t=>{
 const h=await fixture(t),f=await task(h,'if [ ! -f once ]; then touch once; exit 7; fi',{max_attempts:2,notification:'ALWAYS'});
 await h.db.query("INSERT INTO NotificationChannels(name,type,is_default,secret) VALUES('test','WEBHOOK',1,'{}')");
 const run=await h.execution.submit(f.definition.id);await wait(h,run.id);await h.execution.stop();const result=await h.execution.get(run.id);assert.equal(result.status,'SUCCESS');assert.deepEqual(result.result.secondaryErrors,[]);
 const [rows]=await h.db.query('SELECT status,task_run_id FROM NotificationOutbox');assert.equal(rows.length,1);assert.equal(rows[0].status,'PENDING');assert.equal(rows[0].task_run_id,run.id);
});
test('large UTF-8 per-run logs drain all bytes and tail without split-codepoint replacement',async t=>{
 const h=await fixture(t),Log=h.load('back/services/executionLog.ts').default,Redactor=h.load('back/services/executionRedactor.ts').default;const file=await Log.open(h.paths,99),redactor=new Redactor(['split-sensitive-value'],text=>file.write(text));
 const body='中文😀'.repeat(450000);await redactor.write(body+'split-sens');await redactor.write('itive-value');await redactor.flush();await file.close();const entire=await fs.readFile(await Log.file(h.paths,99),'utf8');assert.equal(entire,body+'********');const tail=await Log.read(h.paths,99);assert.ok(!tail.includes('\uFFFD'));assert.ok(tail.endsWith('********'));assert.ok(Buffer.byteLength(tail)<=4*1024*1024);
});
test('graceful shutdown waits for an in-flight claim and cancels its new owner',async t=>{
 const h=await fixture(t),f=await task(h,'touch MAIN_RAN; sleep 30'),run=await h.execution.submit(f.definition.id),owner=h.paths.owner.bind(h.paths);
 let release,entered;const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);h.paths.owner=async id=>{const lease=await owner(id);entered();await gate;return lease;};
 const ticking=h.execution.tick();await ready;let stopped=false;const stopping=h.execution.stop().then(()=>stopped=true);await new Promise(r=>setTimeout(r,30));assert.equal(stopped,false);release();await ticking;await stopping;
 assert.equal((await h.execution.get(run.id)).status,'CANCELLED');await assert.rejects(fs.stat(path.join(f.root,'MAIN_RAN')),{code:'ENOENT'});
});
