const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {Sequelize}=require('sequelize');
const load=require('../../test/helpers/load-security-module.cjs');
const root=path.resolve(__dirname,'../..');
test('actual ORM tables, automatic and manual tasks, and execution exit code in isolated SQLite',async t=>{
  const sequelize=new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});t.after(()=>sequelize.close());
  const mocks={'.':{sequelize},'../data':{sequelize}};
  const {Crontab,CrontabModel}=load(path.join(root,'back/data/cron.ts'),mocks);
  const {SubscriptionModel}=load(path.join(root,'back/data/subscription.ts'),mocks);
  const {RunningInstanceModel,InstanceStatus}=load(path.join(root,'back/data/runningInstance.ts'),mocks);
  // Phase 1 adds referenced tables; retain all original task/data assertions.
  const expected={worktree:'Worktrees',gitCredential:'GitCredentials',repository:'Repositories',cronView:'CrontabViews',cronStats:'CrontabStats',dependence:'Dependences',env:'Envs',open:'Apps',system:'Auths'};
  for(const [file,table] of Object.entries(expected)) {
    const exports=load(path.join(root,`back/data/${file}.ts`),mocks);
    const model=Object.values(exports).find(x=>x?.getTableName);
    assert.equal(model.getTableName(),table);
  }
  load(path.join(root,'back/data/scopedEnv.ts'),mocks);
  await sequelize.sync();
  assert.equal(CrontabModel.getTableName(),'Crontabs');
  assert.equal(SubscriptionModel.getTableName(),'Subscriptions');
  const sub=await SubscriptionModel.create({name:'fixture',url:'file:///fixture',alias:'fixture',type:'public-repo'});
  const manual=await CrontabModel.create(new Crontab({name:'manual',command:'task example.py',schedule:'0 0 * * *'}));
  const discovered=await CrontabModel.create(new Crontab({name:'auto',command:'task fixture/example.py',schedule:'0 0 * * *',sub_id:sub.id}));
  assert.equal(manual.status,discovered.status);assert.equal(discovered.sub_id,sub.id);
  const CronService=load(path.join(root,'back/services/cron.ts'),{
    '../data/cron':{CrontabModel,Crontab,CrontabStatus:{running:0,idle:1,queued:3}},
    '../data/runningInstance':{RunningInstanceModel,InstanceStatus},
    '../config':{},'../config/util':{},'../config/const':{TASK_PREFIX:'task ',QL_PREFIX:'ql '},
    '../schedule/client':{},'../shared/pLimit':{},'../shared/utils':{},'../shared/i18n':{t:x=>x},
    '../shared/logStreamManager':{},'../shared/schedulerMutationLock':{},
  }).default;
  const service=new CronService({info(){},warn(){},error(){}});
  await service.status({ids:[discovered.id],status:0,pid:424242,log_path:'fixture/test.log',last_execution_time:1234});
  await service.status({ids:[discovered.id],status:1,pid:424242,log_path:'fixture/test.log',exit_code:7});
  const instance=await RunningInstanceModel.findOne({where:{cron_id:discovered.id}});
  assert.equal(instance.exit_code,7);assert.equal(instance.status,InstanceStatus.error);
  assert.equal((await CrontabModel.findByPk(discovered.id)).status,1);
  const fk=await sequelize.query('PRAGMA foreign_key_list("Crontabs")', {type:Sequelize.QueryTypes.SELECT});assert.equal(fk.length,1);assert.equal(fk[0].from,'env_profile_id');assert.equal(fk[0].table,'EnvironmentProfiles');
});
