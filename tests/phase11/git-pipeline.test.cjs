const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const setup=require('../phase3/helpers.cjs');
async function pipeline(t){
 const h=await setup(t,{persistent:true});h.mocks['../loaders/logger']={default:{info(){},warn(){},error(){},debug(){}},__esModule:true};
 await fs.writeFile(path.join(h.origin,'job.sh'),'# cron: 0 8 * * *\nprintf "GIT_TRIGGER_OK"\n');h.git('add','.');h.git('commit','-qm','source');
 const Managed=h.get('services/managedSubscription').default,Resolver=h.get('services/subscriptionGit').default,managed=new Managed(h.storage,h.worktrees,new Resolver());
 const sub=await h.SubscriptionModel.create({name:'Phase11',repository_id:h.repo.id,branch:'main'});await managed.preflight(sub.id);await managed.run(sub.id);
 const task=await h.TaskModel.findOne({where:{subscription_id:sub.id}}),tree=await h.WorktreeModel.findByPk((await sub.reload()).worktree_id);
 return {...h,managed,sub,task,tree,triggers:new(h.get('services/taskTrigger').default)()};
}
test('Real Git fetch/update -> discovery -> typed Git events, dedup and source filters',async t=>{
 const h=await pipeline(t);
 const any=await h.triggers.save(h.task.id,{type:'GIT_UPDATE',config:{mode:'ANY_CHANGE'}}),source=await h.triggers.save(h.task.id,{type:'GIT_UPDATE',config:{mode:'SOURCE_CHANGE'}}),filter=await h.triggers.save(h.task.id,{type:'GIT_UPDATE',config:{mode:'PATH_FILTER',path_filters:['lib/**/*.sh']}});
 await h.TaskExecutionSettingsModel.update({concurrency:'ALLOW'},{where:{task_id:h.task.id}});
 await h.managed.run(h.sub.id);assert.equal(await h.TriggerEventModel.count(),0);
 await fs.writeFile(path.join(h.origin,'unrelated.txt'),'changed');h.git('add','.');h.git('commit','-qm','unrelated');await h.managed.run(h.sub.id);
 assert.equal(await h.TriggerEventModel.count(),3);assert.equal(await h.TaskRunModel.count(),1);
 assert.equal((await h.TriggerEventModel.findOne({where:{trigger_id:source.id}})).error_code,'GIT_SOURCE_UNCHANGED');assert.equal((await h.TriggerEventModel.findOne({where:{trigger_id:filter.id}})).error_code,'GIT_PATH_UNMATCHED');
 await h.managed.run(h.sub.id);assert.equal(await h.TaskRunModel.count(),1);
 await fs.writeFile(path.join(h.origin,'job.sh'),'# name: Updated source\n# cron: 0 9 * * *\nprintf "GIT_TRIGGER_OK"\n');h.git('add','.');h.git('commit','-qm','source change');await h.managed.run(h.sub.id);
 assert.equal(await h.TaskRunModel.count(),3);assert.equal((await h.task.reload()).name,'Updated source');
 assert.equal(await h.SchedulerProjectionModel.count(),0);
 await assert.rejects(fs.stat(path.join(h.dir,'scripts','subscription-'+h.sub.id)));
 const execution=h.get('services/executionService').executionService;t.after(()=>execution.stop());
 const runs=await h.TaskRunModel.findAll();for(const run of runs){for(let i=0;i<150;i++){await execution.tick();await run.reload();if(!['QUEUED','RESOLVING','RUNNING'].includes(run.status))break;await new Promise(r=>setTimeout(r,30));}assert.equal(run.status,'SUCCESS',JSON.stringify(run.get({plain:true})));}
});
for(const state of ['dirty','untracked','ahead','missing','detached'])test(`Real Git ${state} refuses sync and preserves Task definition`,async t=>{
 const h=await pipeline(t),before=h.task.get({plain:true});
 if(state==='missing')await fs.rm(h.tree.local_path,{recursive:true});
 else if(state==='detached')h.local(h.tree.local_path,'checkout','--detach');
 else{await fs.writeFile(path.join(h.tree.local_path,state==='untracked'?'extra':'job.sh'),'local');if(state==='ahead'){h.local(h.tree.local_path,'add','.');h.local(h.tree.local_path,'commit','-qm','local');}}
 await assert.rejects(h.managed.run(h.sub.id));assert.deepEqual((await h.task.reload()).get({plain:true}),before);assert.equal((await h.sub.reload()).last_sync_state,'FAILED');
});
test('Discovery failure leaves successful Git update recoverable at same commit',async t=>{
 const h=await pipeline(t),Discovery=h.get('services/discovery').default,original=Discovery.prototype.reconcile;
 await fs.writeFile(path.join(h.origin,'job.sh'),'# name: After retry\nprintf retry\n');h.git('add','.');h.git('commit','-qm','retry');
 Discovery.prototype.reconcile=async()=>{throw Error('injected');};try{await assert.rejects(h.managed.run(h.sub.id));}finally{Discovery.prototype.reconcile=original;}
 assert.equal((await h.sub.reload()).last_sync_phase,'DISCOVERY');assert.match(await fs.readFile(path.join(h.tree.local_path,'job.sh'),'utf8'),/After retry/);
 await h.managed.run(h.sub.id);assert.equal((await h.task.reload()).name,'After retry');assert.equal((await h.sub.reload()).last_sync_state,'SUCCESS');
});
for(const failure of ['branch deleted','force push','storage missing','disabled credential'])test(`${failure} stops before Discovery and Git triggers`,async t=>{
 const h=await pipeline(t),before=h.task.get({plain:true});
 if(failure==='branch deleted'){h.git('checkout','dev');h.git('branch','-D','main');}
 if(failure==='force push'){h.git('reset','--hard','HEAD~1');await fs.writeFile(path.join(h.origin,'diverged.txt'),'diverged');h.git('add','.');h.git('commit','-qm','rewritten');}
 if(failure==='storage missing'){const repo=await h.storage.get(h.repo.id);await fs.rename(repo.storage_path,repo.storage_path+'.preserved');}
 if(failure==='disabled credential'){const credential=await h.credentials.save({name:'disabled',provider:'generic',auth_type:'https_token',token:'test-do-not-leak'});await h.GitCredentialModel.update({status:'disabled'},{where:{id:credential.id}});await h.RepositoryModel.update({default_credential_id:credential.id},{where:{id:h.repo.id}});}
 await assert.rejects(h.managed.run(h.sub.id));assert.deepEqual((await h.task.reload()).get({plain:true}),before);assert.equal(await h.TriggerEventModel.count(),0);
});
test('Managed leases block overlapping sync, update and binding; symlink is ignored',async t=>{
 const h=await pipeline(t);
 await h.managed.exclusive(h.sub.id,async()=>{await assert.rejects(h.managed.run(h.sub.id));await assert.rejects(h.managed.preflight(h.sub.id));});
 await h.worktrees.withSync(h.tree.id,async()=>{await assert.rejects(h.worktrees.update(h.tree.id));await assert.rejects(h.storage.fetch(h.repo.id));});
 await fs.symlink('/etc/passwd',path.join(h.origin,'outside.sh'));h.git('add','.');h.git('commit','-qm','symlink');await h.managed.run(h.sub.id);
 assert.equal(await h.TaskSourceModel.count({where:{relative_entrypoint:'outside.sh'}}),0);
 assert.ok(JSON.stringify((await h.DiscoveryPolicyModel.findOne()).last_result).includes('SYMLINK_IGNORED'));
});
test('Branch rebinding updates discovered source while retaining old Worktree',async t=>{
 const h=await pipeline(t),old=h.tree.id;h.git('branch','feature/new');
 await h.managed.withBinding({...h.sub.get({plain:true}),branch:'feature/new'},id=>h.sub.update({branch:'feature/new',worktree_id:id}));await h.managed.run(h.sub.id);
 assert.notEqual(h.sub.worktree_id,old);assert.ok(await h.WorktreeModel.findByPk(old));assert.equal((await h.TaskSourceModel.findByPk(h.task.id)).worktree_id,h.sub.worktree_id);
});
test('Git diff failure records FAILED event and creates no Run; first sync is opt-in',async t=>{
 const h=await pipeline(t);const trigger=await h.triggers.save(h.task.id,{type:'GIT_UPDATE',config:{mode:'SOURCE_CHANGE'}});
 await h.sub.update({last_synced_commit:'f'.repeat(40)});await h.managed.run(h.sub.id);
 const event=await h.TriggerEventModel.findOne({where:{trigger_id:trigger.id}});assert.equal(event.status,'FAILED');assert.equal(event.error_code,'GIT_DIFF_FAILED');assert.equal(await h.TaskRunModel.count(),0);
 await h.sub.update({last_synced_commit:null});await h.managed.run(h.sub.id);assert.equal(await h.TriggerEventModel.count({where:{error_code:'GIT_INITIAL_SYNC_SKIPPED'}}),1);assert.equal(await h.TaskRunModel.count(),0);
});
