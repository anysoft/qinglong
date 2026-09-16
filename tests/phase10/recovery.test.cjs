const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{fork,execFileSync}=require('node:child_process');
const {fixture,task,wait}=require('./helpers.cjs');
async function until(read,predicate,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(predicate(value))return value;await new Promise(r=>setTimeout(r,30));}throw Error('Condition timeout');}
async function child(root){const worker=fork(path.join(__dirname,'crash-worker.cjs'),[root],{stdio:['ignore','pipe','pipe','ipc']});let errors='';worker.stderr.on('data',data=>errors+=data);await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.once('exit',()=>reject(Error(errors)));});return worker;}
async function config(h,id){const assets=new(h.load('back/services/configAsset.ts').default)(),asset=await assets.save({name:'secret asset',is_secret:true,content:'materialized-secret'});await new(h.load('back/services/taskConfig.ts').default)().save('task',id,{asset_id:asset.id,operation:'ATTACH',target_base:'WORKSPACE_ROOT',target_path:'config.txt',materialization_mode:'COPY',conflict_policy:'REPLACE_RESTORE',writable:false,enabled:true});return {assets,asset};}
test('SIGKILL recovery waits for inherited ownership, reaps descendants and restores Config; queued run survives',async t=>{
 const h=await fixture(t),f=await task(h,'(trap "" TERM; while :; do sleep 1; done) &\necho $! > child.pid\necho ready > started\nwhile :; do sleep 1; done',{concurrency:'QUEUE'});await fs.writeFile(path.join(f.root,'config.txt'),'original');await config(h,f.definition.id);
 const run=await h.execution.submit(f.definition.id),next=await h.execution.submit(f.definition.id);const worker=await child(h.root);t.after(()=>{if(worker.exitCode===null)worker.kill('SIGKILL');});
 await until(()=>fs.readFile(path.join(f.root,'started'),'utf8').catch(()=>''),text=>text==='ready\n');
 assert.equal(await fs.readFile(path.join(f.root,'config.txt'),'utf8'),'materialized-secret');const pid=Number(await fs.readFile(path.join(f.root,'child.pid'),'utf8'));
 await assert.rejects(h.paths.owner(run.id),/RUNTIME_BUSY/);worker.kill('SIGKILL');await new Promise(resolve=>worker.once('exit',resolve));
 await until(async()=>{await h.execution.recover();return h.execution.get(run.id);},row=>row.status==='INTERRUPTED');
 await until(async()=>{try{return execFileSync('/bin/ps',['-o','stat=','-p',String(pid)],{encoding:'utf8'}).trim();}catch{return '';}},state=>!state||state.startsWith('Z'));
 assert.equal(await fs.readFile(path.join(f.root,'config.txt'),'utf8'),'original');assert.equal((await h.execution.get(next.id)).status,'QUEUED');assert.equal((await h.TaskRunAttemptModel.findOne()).status,'INTERRUPTED');await h.execution.cancel(next.id);
});
test('two independent dispatchers atomically claim one queued run',async t=>{
 const h=await fixture(t),f=await task(h,'printf once >> counter; sleep .3');const run=await h.execution.submit(f.definition.id);const a=await child(h.root),b=await child(h.root);
 t.after(()=>{for(const worker of [a,b])if(worker.exitCode===null)worker.kill('SIGKILL');});
 const result=await until(()=>h.execution.get(run.id),row=>row.status==='SUCCESS');assert.equal(result.attempt_count,1);assert.equal(await fs.readFile(path.join(f.root,'counter'),'utf8'),'once');assert.equal(await h.TaskRunAttemptModel.count(),1);
 for(const worker of [a,b]){worker.send('stop');await new Promise(resolve=>worker.once('exit',resolve));}
});
test('cleanup conflict preserves unexpected file and backup, preventing SUCCESS',async t=>{
 const h=await fixture(t),f=await task(h,'mv config.txt installed.old; printf user-created > config.txt');await fs.writeFile(path.join(f.root,'config.txt'),'original');await config(h,f.definition.id);
 const result=await wait(h,(await h.execution.submit(f.definition.id)).id);assert.equal(result.status,'RECOVERY_REQUIRED');assert.equal(await fs.readFile(path.join(f.root,'config.txt'),'utf8'),'user-created');
 const Materializer=h.load('back/services/configMaterialization.ts').default,m=new Materializer();const dirs=await fs.readdir(path.join(m.root,h.paths.resourceKey(f.worktree.id)));assert.equal(dirs.length,1);assert.equal(await fs.readFile(path.join(m.root,h.paths.resourceKey(f.worktree.id),dirs[0],'backup-0'),'utf8'),'original');
});
test('backoff cancellation is prompt and keeps original workspace locked until cleanup',async t=>{
 const h=await fixture(t),f=await task(h,'exit 4',{max_attempts:3,initial_delay_seconds:30});const run=await h.execution.submit(f.definition.id);await h.execution.tick();
 await until(()=>h.TaskRunAttemptModel.count({where:{task_run_id:run.id,status:'FAILED'}}),count=>count===1);await assert.rejects(h.paths.worktree(f.worktree.id),/RUNTIME_BUSY/);
 const start=Date.now();await h.execution.cancel(run.id);const result=await wait(h,run.id);assert.equal(result.status,'CANCELLED');assert.equal(result.attempt_count,1);assert.ok(Date.now()-start<2000);
});
