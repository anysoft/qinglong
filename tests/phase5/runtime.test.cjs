const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {fixture}=require('./helpers.cjs');
async function runtime(t){
 const h=await fixture(t),source=path.resolve('.');
 h.config.fixturePublicationNamespace='subscription-1';
 h.config.scriptPath=path.join(h.root,'scripts/subscription-1');
 await fs.mkdir(h.config.scriptPath,{recursive:true});
 await fs.cp(path.join(source,'shell'),path.join(h.root,'shell'),{recursive:true});
 for(const dir of ['config','log','db','static'])await fs.mkdir(path.join(h.root,dir),{recursive:true});
 await fs.symlink(path.join(h.root,'database.sqlite'),path.join(h.root,'db/database.sqlite'));
 await fs.symlink(path.join(source,'static/build'),path.join(h.root,'static/build'));
 await fs.symlink(path.join(source,'node_modules'),path.join(h.root,'node_modules'));
 await fs.writeFile(path.join(h.root,'.env'),'');
 await fs.writeFile(path.join(h.root,'config/config.sh'),'');await fs.writeFile(path.join(h.root,'config/crontab.list'),'');
 await fs.writeFile(path.join(h.root,'shell/api.sh'),'update_cron() { :; }\nrecord_cron_stat() { :; }\n');
 for(const [file,text]of Object.entries({'client.js':'module.exports={}','client.py':'class Client: pass\n','__ql_notify__.js':'exports.sendNotify=()=>{}','__ql_notify__.py':'def send(*args): pass\n'}))await fs.writeFile(path.join(h.root,'shell/preload',file),text);
 const assets=new(h.load('back/services/configAsset.ts').default)(),bindings=new(h.load('back/services/taskConfig.ts').default)(),hooks=new(h.load('back/services/taskHooks.ts').default)();
 const run=(task,file,extra={})=>{
  const published=file.startsWith('subscription-')?file:'subscription-1/'+file;
  const child=spawn('/bin/bash',[path.join(h.root,'shell/task.sh'),published,'now'],{env:{...process.env,PLATFORM_RECOVERY_TEST_ONLY:'1',QL_DIR:h.root,QL_DATA_DIR:h.root,ID:String(task.id),real_time:'true',...extra}});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal,output}));});return {child,done,output:()=>output};
 };
 const addHook=(task,phase,command,extra={})=>hooks.save(task.id,{name:phase,phase,command,cwd_base:'TASK_CWD',position:10,timeout_seconds:5,failure_policy:phase==='AFTER_FAILURE'?'CONTINUE':'FAIL_EXECUTION',enabled:true,...extra});
 return {...h,assets,bindings,hooks,run,addHook};
}
for(const language of ['sh','js','py'])test(`real ${language} current MAIN bridge, config in all phases, generated Secret patch/redaction and cleanup`,{timeout:30000},async t=>{
 const h=await runtime(t),file=`main.${language}`,task=await h.SchedulerProjectionModel.create({command:`task ${file}`});
 const content={sh:'[[ "$TOKEN" == "generated-private" && -z ${OLD_TOKEN+x} ]] || exit 8\ncat config.yaml\nprintf "MAIN_OK %s\\n" "$TOKEN"\n',js:'const fs=require("fs");if(process.env.TOKEN!=="generated-private"||"OLD_TOKEN" in process.env)process.exit(8);console.log(fs.readFileSync("config.yaml","utf8"));console.log("MAIN_OK",process.env.TOKEN);',py:'import os\nassert os.environ["TOKEN"] == "generated-private" and "OLD_TOKEN" not in os.environ\nprint(open("config.yaml").read())\nprint("MAIN_OK",os.environ["TOKEN"])\n'}[language];await fs.writeFile(path.join(h.config.scriptPath,file),content);
 await h.EnvModel.create({name:'OLD_TOKEN',value:'old'});
 const asset=await h.assets.save({name:'secret',is_secret:true,content:'CONFIG_PRIVATE_CONTENT'});
 await h.bindings.save('task',task.id,{asset_id:asset.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,enabled:true});
 await h.addHook(task,'BEFORE',`cat config.yaml; printf 'BEFORE_OK generated-private\\n'; printf '%s' '{"environment":{"set":{"TOKEN":"generated-private"},"unset":["OLD_TOKEN"],"secret":["TOKEN"]}}' > "$PLATFORM_HOOK_OUTPUT"`);
 await h.addHook(task,'AFTER_SUCCESS','cat config.yaml; echo AFTER_OK');await h.addHook(task,'AFTER_FAILURE','echo MUST_NOT_RUN');await h.addHook(task,'FINALLY','cat config.yaml; echo FINALLY_OK');
 const result=await h.run(task,file).done;assert.equal(result.code,0,result.output);assert.doesNotMatch(result.output,/CONFIG_PRIVATE_CONTENT|generated-private|MUST_NOT_RUN/);
 const markers=['BEFORE_OK','MAIN_OK','AFTER_OK','FINALLY_OK','[CLEANUP] Completed'];let previous=-1;for(const marker of markers){const index=result.output.indexOf(marker);assert.ok(index>previous,result.output);previous=index;}
 await assert.rejects(fs.stat(path.join(h.config.scriptPath,'config.yaml')),{code:'ENOENT'});assert.equal(await h.EnvModel.count({where:{name:'TOKEN'}}),0);
});
test('real BEFORE timeout kills descendants, skips remaining BEFORE/MAIN, runs AFTER_FAILURE and FINALLY',{timeout:30000},async t=>{
 const h=await runtime(t),task=await h.SchedulerProjectionModel.create({command:'task main.sh'});await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),'echo MUST_NOT_RUN');
 await h.addHook(task,'BEFORE','sleep 20 & echo $! > descendant.pid; wait',{timeout_seconds:1});await h.addHook(task,'BEFORE','echo MUST_NOT_RUN',{position:20});await h.addHook(task,'AFTER_FAILURE','echo FAILURE_OK');await h.addHook(task,'FINALLY','echo FINALLY_OK');
 const r=await h.run(task,'main.sh').done;assert.equal(r.code,124,r.output);assert.doesNotMatch(r.output,/MUST_NOT_RUN/);assert.match(r.output,/FAILURE_OK/);assert.match(r.output,/FINALLY_OK/);const pid=Number(await fs.readFile(path.join(h.config.scriptPath,'descendant.pid'),'utf8'));assert.throws(()=>process.kill(pid,0),{code:'ESRCH'});
});
async function waitFor(check){const end=Date.now()+10000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('runtime condition timeout');}
for(const scenario of [
 {name:'main failure',main:'exit 7',code:7,after:'AFTER_FAILURE',hooks:[]},
 {name:'AFTER_SUCCESS failure never triggers AFTER_FAILURE',main:'echo MAIN_OK',code:9,after:'AFTER_SUCCESS',hooks:[['AFTER_SUCCESS','exit 9']]},
 {name:'FINALLY failure changes success',main:'echo MAIN_OK',code:11,after:'AFTER_SUCCESS',hooks:[['FINALLY','exit 11']]},
 {name:'FINALLY failure preserves primary',main:'exit 7',code:7,after:'AFTER_FAILURE',hooks:[['FINALLY','exit 11']]},
 {name:'CONTINUE before failure permits MAIN',main:'echo MAIN_OK',code:0,after:'AFTER_SUCCESS',hooks:[['BEFORE','exit 9',{failure_policy:'CONTINUE'}]]},
 {name:'invalid BEFORE output fails without leaking generated log',main:'echo MUST_NOT_RUN',code:1,after:'AFTER_FAILURE',hooks:[['BEFORE','echo UNKNOWN_GENERATED_SECRET; echo invalid > "$PLATFORM_HOOK_OUTPUT"']]},
])test(`lifecycle: ${scenario.name}`,{timeout:20000},async t=>{
 const h=await runtime(t),task=await h.SchedulerProjectionModel.create({command:'task main.sh'});await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),scenario.main);
 for(const [phase,command,extra]of scenario.hooks)await h.addHook(task,phase,command,extra);
 for(const phase of ['AFTER_SUCCESS','AFTER_FAILURE','FINALLY'])await h.addHook(task,phase,`echo VISITED_${phase}`,{position:20});
 const r=await h.run(task,'main.sh').done;assert.equal(r.code,scenario.code,r.output);assert.match(r.output,new RegExp('VISITED_'+scenario.after));assert.doesNotMatch(r.output,new RegExp('VISITED_'+(scenario.after==='AFTER_SUCCESS'?'AFTER_FAILURE':'AFTER_SUCCESS')));assert.match(r.output,/VISITED_FINALLY/);assert.doesNotMatch(r.output,/UNKNOWN_GENERATED_SECRET|MUST_NOT_RUN/);
});
for(const tee of [false,true])test(`graceful cancellation tee=${tee} executes AFTER_FAILURE/FINALLY with config, then restores original`,{timeout:20000},async t=>{
 const h=await runtime(t),task=await h.SchedulerProjectionModel.create({command:'task main.sh'}),target=path.join(h.config.scriptPath,'config.yaml');await fs.writeFile(target,'ORIGINAL');await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),'echo ready > ready; sleep 20');
 const asset=await h.assets.save({name:'cancel',is_secret:false,content:'INJECTED'});await h.bindings.save('task',task.id,{asset_id:asset.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'COPY',conflict_policy:'REPLACE_RESTORE',writable:false,enabled:true});
 await h.addHook(task,'AFTER_FAILURE','echo CANCEL_FAILURE');await h.addHook(task,'FINALLY','cat config.yaml; echo CANCEL_FINALLY');
 const running=h.run(task,'main.sh',typeof tee==='boolean'&&tee?{real_time:'false'}:{});await waitFor(()=>fs.stat(path.join(h.config.scriptPath,'ready')).then(()=>true,()=>false));running.child.kill('SIGTERM');const r=await running.done;
 assert.equal(r.code,143,r.output);assert.match(r.output,/CANCEL_FAILURE/);assert.match(r.output,/INJECTED/);assert.match(r.output,/CANCEL_FINALLY/);assert.equal(await fs.readFile(target,'utf8'),'ORIGINAL');
});
test('same workspace BUSY, different workspace parallel, SIGKILL lease recovery restores config',{timeout:30000},async t=>{
 const h=await runtime(t),task=await h.SchedulerProjectionModel.create({command:'task main.sh'}),target=path.join(h.config.scriptPath,'config.yaml');await fs.writeFile(target,'ORIGINAL');await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),'echo ready > ready; sleep 20');
 const asset=await h.assets.save({name:'crash',is_secret:false,content:'INJECTED'});await h.bindings.save('task',task.id,{asset_id:asset.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'SYMLINK',conflict_policy:'REPLACE_RESTORE',writable:false,enabled:true});
 const running=h.run(task,'main.sh');await waitFor(()=>fs.stat(path.join(h.config.scriptPath,'ready')).then(()=>true,()=>false));
 const busy=await h.run(task,'main.sh').done;assert.equal(busy.code,75,busy.output);assert.match(busy.output,/CONFIG_WORKSPACE_BUSY/);
 await fs.mkdir(path.join(h.root,'scripts/subscription-99'));await fs.writeFile(path.join(h.root,'scripts/subscription-99/other.sh'),'cat config.yaml; echo PARALLEL_OK');const other=await h.SchedulerProjectionModel.create({command:'task subscription-99/other.sh'});await h.bindings.save('task',other.id,{asset_id:asset.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,enabled:true});
 const parallel=await h.run(other,'subscription-99/other.sh').done;assert.equal(parallel.code,0,parallel.output);assert.match(parallel.output,/PARALLEL_OK/);
 const ps=require('node:child_process').execFileSync('ps',['-axo','pid=,command='],{encoding:'utf8'});const line=ps.split('\n').find(x=>x.includes('--prepared '+h.root+'/')&&!x.includes('execution_lease.py'));assert.ok(line);const killedAt=Date.now();process.kill(Number(line.trim().split(/\s+/)[0]),'SIGKILL');await running.done;assert.ok(Date.now()-killedAt<5000,'controller crash must terminate process group promptly');assert.equal(await fs.readFile(target,'utf8'),'INJECTED');
 await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),'cat config.yaml; echo RECOVERED_OK');let result;await waitFor(async()=>{result=await h.run(task,'main.sh').done;return result.code!==75;});assert.equal(result.code,0,result.output);assert.match(result.output,/RECOVERED_OK/);assert.equal(await fs.readFile(target,'utf8'),'ORIGINAL');
});
test('live execution pins Config revision, ENV and Hook plan across edits; next run observes new values',{timeout:25000},async t=>{
 const h=await runtime(t),task=await h.SchedulerProjectionModel.create({command:'task main.sh'});await h.EnvModel.create({name:'SNAPSHOT_ENV',value:'ENV_OLD'});
 await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),'cat config.yaml; echo "$SNAPSHOT_ENV"; touch ready; while [[ ! -f release ]]; do sleep 0.05; done; cat config.yaml; echo MAIN_OK');
 const asset=await h.assets.save({name:'pin',is_secret:false,content:'REVISION_OLD'});await h.bindings.save('task',task.id,{asset_id:asset.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,enabled:true});const hook=await h.addHook(task,'FINALLY','echo FINALLY_OLD');
 const first=h.run(task,'main.sh');await waitFor(()=>fs.stat(path.join(h.config.scriptPath,'ready')).then(()=>true,()=>false));await h.assets.save({...asset,expected_version:asset.version,content:'REVISION_NEW'});await h.hooks.save(task.id,{...hook,expected_version:hook.version,command:'echo FINALLY_NEW'});await h.EnvModel.update({value:'ENV_NEW'},{where:{name:'SNAPSHOT_ENV'}});await fs.writeFile(path.join(h.config.scriptPath,'release'),'');
 const a=await first.done;assert.equal(a.code,0,a.output);assert.equal(a.output.match(/REVISION_OLD/g).length,2);assert.match(a.output,/ENV_OLD/);assert.match(a.output,/FINALLY_OLD/);assert.doesNotMatch(a.output,/REVISION_NEW|ENV_NEW|FINALLY_NEW/);
 const b=await h.run(task,'main.sh').done;assert.equal(b.code,0,b.output);assert.equal(b.output.match(/REVISION_NEW/g).length,2);assert.match(b.output,/ENV_NEW/);assert.match(b.output,/FINALLY_NEW/);
});
test('retained recovery bridge preserves Config/Hooks; scheduler projection carries Task ID only',{timeout:25000},async t=>{
 require('reflect-metadata');const h=await runtime(t),task=await h.SchedulerProjectionModel.create({command:'task main.sh'});await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),'cat config.yaml; echo MAIN_PARITY; exit 7');const a=await h.assets.save({name:'parity',is_secret:false,content:'CONFIG_PARITY'});await h.bindings.save('task',task.id,{asset_id:a.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,enabled:true});await h.addHook(task,'BEFORE','echo BEFORE_PARITY');await h.addHook(task,'AFTER_FAILURE','echo FAILURE_PARITY');await h.addHook(task,'FINALLY','echo FINALLY_PARITY');
 const load=require('../../test/helpers/load-security-module.cjs'),logger={info(){},error(){},warn(){}};
 const mocks={...h.mocks,'../config/util':{},'../config/const':{TASK_PREFIX:'task '},'../schedule/client':{},'../shared/pLimit':{},'../shared/utils':{},'../shared/i18n':{t:x=>x},'../shared/logStreamManager':{}};
 const Cron=load(path.resolve('back/services/cron.ts'),mocks).default,service=new Cron(logger);await fs.mkdir(path.join(h.root,'bin'));await fs.symlink(path.join(h.root,'shell/task.sh'),path.join(h.root,'bin/task'));const environment={...process.env,QL_DIR:h.root,QL_DATA_DIR:h.root,PATH:path.join(h.root,'bin')+':'+process.env.PATH};
 const check=output=>{for(const marker of ['BEFORE_PARITY','MAIN_PARITY','FAILURE_PARITY','FINALLY_PARITY','CONFIG_PARITY','[CLEANUP] Completed'])assert.ok(output.includes(marker),output);};
 const manual=await h.run(task,'main.sh').done;assert.equal(manual.code,7);check(manual.output);
 const command=service.makeCommand(task.get({plain:true}),true);assert.match(command,/taskRunSubmit\.js/);assert.ok(!command.includes('main.sh'));assert.ok(!command.includes('CONFIG_PARITY'));
 // Actual manual/scheduler/system-cron parity now lives in Phase 10 entrypoints.test.cjs.
});
test('PREPARE conflict starts no user phase and preserves existing data',{timeout:15000},async t=>{
 const h=await runtime(t),task=await h.SchedulerProjectionModel.create({command:'task main.sh'});await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),'echo USER_PHASE_MUST_NOT_RUN');await fs.writeFile(path.join(h.config.scriptPath,'config.yaml'),'ORIGINAL');const a=await h.assets.save({name:'conflict',is_secret:false,content:'INJECTED'});await h.bindings.save('task',task.id,{asset_id:a.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,enabled:true});for(const phase of ['BEFORE','AFTER_FAILURE','FINALLY'])await h.addHook(task,phase,'echo USER_PHASE_MUST_NOT_RUN');const r=await h.run(task,'main.sh').done;assert.equal(r.code,1,r.output);assert.match(r.output,/CONFIG_TARGET_EXISTS/);assert.doesNotMatch(r.output,/USER_PHASE_MUST_NOT_RUN|\[BEFORE\]|\[MAIN\]|\[FINALLY\]/);assert.equal(await fs.readFile(path.join(h.config.scriptPath,'config.yaml'),'utf8'),'ORIGINAL');assert.deepEqual(await fs.readdir(path.join(h.root,'.tmp/task-env')),[]);
});
test('MAIN timeout invokes failure and finally independently of hook deadlines',{timeout:15000},async t=>{
 const h=await runtime(t),task=await h.SchedulerProjectionModel.create({command:'task main.sh'});await fs.writeFile(path.join(h.config.scriptPath,'main.sh'),'sleep 20');await h.addHook(task,'AFTER_FAILURE','echo MAIN_TIMEOUT_FAILURE');await h.addHook(task,'FINALLY','echo MAIN_TIMEOUT_FINALLY');const r=await h.run(task,'main.sh',{CommandTimeoutTime:'1s'}).done;assert.equal(r.code,124,r.output);assert.match(r.output,/MAIN:TIMEOUT/);assert.match(r.output,/MAIN_TIMEOUT_FAILURE/);assert.match(r.output,/MAIN_TIMEOUT_FINALLY/);
});
test('all publication sources share the existing global publication-1 lease',{timeout:15000},async t=>{
 const h=await runtime(t);await fs.mkdir(path.join(h.root,'scripts/subscription-42'));await fs.writeFile(path.join(h.root,'scripts/subscription-42/main.sh'),'echo PUBLICATION_OK');const task=await h.SchedulerProjectionModel.create({command:'task subscription-42/main.sh'});await fs.mkdir(path.join(h.root,'.locks'));
 const lock=spawn('python3',['-I','-S','-c','import fcntl,sys; f=open(sys.argv[1],"a"); fcntl.flock(f,fcntl.LOCK_EX); print("READY",flush=True); sys.stdin.read()',path.join(h.root,'.locks/publication-1.lock')]);await new Promise(r=>lock.stdout.once('data',r));const done=new Promise(r=>lock.on('close',r));try{const busy=await h.run(task,'subscription-42/main.sh').done;assert.equal(busy.code,75,busy.output);assert.match(busy.output,/CONFIG_WORKSPACE_BUSY/);}finally{lock.stdin.end();await done;}const good=await h.run(task,'subscription-42/main.sh').done;assert.equal(good.code,0,good.output);assert.match(good.output,/PUBLICATION_OK/);
});
