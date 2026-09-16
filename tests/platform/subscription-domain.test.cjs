const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const setup=require('../phase3/helpers.cjs');const {Container}=require('typedi');
async function domain(t){
 const h=await setup(t),events=[];
 Object.assign(h.mocks['../config/util'],{
  handleLogPath:async(name,text)=>{const file=path.join(h.dir,'log',name);await fs.mkdir(path.dirname(file),{recursive:true});if(text)await fs.writeFile(file,text);return file},
  killTask:async pid=>events.push(['kill',pid]),promiseExec:async()=>'',
 });
 const Resolver=h.get('services/subscriptionGit').default,Sync=h.get('services/managedSubscription').default;
 Container.set(Resolver,new Resolver());Container.set(Sync,new Sync(h.storage,h.worktrees,new Resolver()));
 t.after(()=>{Container.remove(Resolver);Container.remove(Sync)});
 h.mocks['../shared/i18n'].tf=(text,value)=>text.replace('%s',value);
 const schedule={cancelCronTask:async x=>events.push(['cancel-cron',x.id]),createCronTask:async(x,callbacks)=>events.push(['cron',x,callbacks]),cancelIntervalTask:async x=>events.push(['cancel-interval',x.id]),createIntervalTask:async(x,rule,immediate,callbacks)=>events.push(['interval',x,rule,callbacks]),runTask:async(command,callbacks,meta)=>events.push(['manual',command,callbacks,meta])};
 const Service=h.get('services/subscription').default;
 const service=new Service({error(){}},schedule,{sendMessage(){}},{remove:async ids=>h.SchedulerProjectionModel.destroy({where:{id:ids}})});
 return {...h,service,events,sync:Container.get(Sync),resolver:Container.get(Resolver)};
}
test('repository required at domain and DB boundaries; obsolete API fields cannot become persisted columns',async t=>{
 const h=await domain(t);
 await assert.rejects(h.service.create({name:'URL only',url:'https://example.invalid/repo',schedule_type:'crontab'}),/Repository is required/);
 await assert.rejects(h.SubscriptionModel.create({name:'missing'}));
 const columns=await h.sequelize.getQueryInterface().describeTable('Subscriptions');
 for(const key of ['git_mode','url','type','credential_id','pull_type','pull_option','alias','proxy','command'])assert.equal(Object.hasOwn(columns,key),false,key);
 assert.equal(columns.repository_id.allowNull,false);
});
test('CRUD, cron/interval registration, manual dispatch, stop and ID log identity use one pipeline',async t=>{
 const h=await domain(t);
 const sub=await h.service.create({name:'one',repository_id:h.repo.id,schedule_type:'crontab',schedule:'0 * * * *'});
 assert.equal((await sub.reload()).worktree_id,null);
 assert.equal(h.events.find(x=>x[0]==='cron')[1].command.includes('gitSubscription'),true);
 await h.service.disabled([sub.id]);assert.equal((await sub.reload()).is_disabled,1);
 await h.service.enabled([sub.id]);assert.equal((await sub.reload()).is_disabled,0);
 await h.service.update({id:sub.id,repository_id:h.repo.id,name:'renamed',schedule_type:'interval',interval_schedule:{type:'seconds',value:5}});
 assert.deepEqual(h.events.find(x=>x[0]==='interval')[2],{seconds:5});
 await h.service.run([sub.id]);for(let i=0;i<30&&!h.events.some(x=>x[0]==='manual');i++)await new Promise(r=>setTimeout(r,10));
 const dispatch=h.events.find(x=>x[0]==='manual');assert.ok(dispatch);assert.equal(dispatch[1].includes(h.repo.remote_url),false);
 await dispatch[2].onBefore(require('dayjs')());
 assert.ok((await sub.reload()).log_path.startsWith(`subscription-${sub.id}/`));
 assert.match((await h.service.log(sub.id)).content,/开始执行/);
 assert.equal((await h.service.logs(sub.id)).length,1);
 await sub.update({pid:12345,last_sync_state:'RUNNING'});await h.service.stop([sub.id]);
 assert.equal((await sub.reload()).last_sync_phase,'CANCELLED');assert.ok(h.events.some(x=>x[0]==='kill'));
 await h.service.remove([sub.id],{});assert.equal(await h.SubscriptionModel.count(),0);
 assert.ok(await h.RepositoryModel.findByPk(h.repo.id));
});
test('only repository credential is resolved; disabled credential fails instead of anonymous fallback',async t=>{
 const h=await domain(t),credential=await h.credentials.save({name:'token',provider:'generic',auth_type:'https_token',token:'fixture-secret'});
 await h.RepositoryModel.update({default_credential_id:credential.id},{where:{id:h.repo.id}});
 const sub=await h.service.create({repository_id:h.repo.id,name:'with credential',schedule_type:'crontab'});
 assert.equal((await h.resolver.resolveSubscriptionGitContext(sub)).credential.id,credential.id);
 await h.GitCredentialModel.update({status:'disabled'},{where:{id:credential.id}});
 await assert.rejects(h.resolver.resolveSubscriptionGitContext(sub),/disabled/);
 await assert.rejects(h.credentials.remove(credential.id));
});
