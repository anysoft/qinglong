const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {Sequelize}=require('sequelize');
const load=require('../../test/helpers/load-security-module.cjs');
const root=path.resolve(__dirname,'../..');
test('actual ORM tables, automatic and manual tasks, and execution exit code in isolated SQLite',async t=>{
  const sequelize=new Sequelize({dialect:'sqlite',storage:':memory:',logging:false});t.after(()=>sequelize.close());
  const mocks={'.':{sequelize},'../data':{sequelize}};
  const {SchedulerProjection,SchedulerProjectionModel}=load(path.join(root,'back/data/cron.ts'),mocks);
  const {SubscriptionModel}=load(path.join(root,'back/data/subscription.ts'),mocks);
  const {RunningInstanceModel,InstanceStatus}=load(path.join(root,'back/data/runningInstance.ts'),mocks);
  // Phase 1 adds referenced tables; retain all original task/data assertions.
  const expected={worktree:'Worktrees',gitCredential:'GitCredentials',repository:'Repositories',cronView:'TaskViews',cronStats:'TaskStats',dependence:'Dependences',env:'Envs',open:'Apps',system:'Auths'};
  for(const [file,table] of Object.entries(expected)) {
    const exports=load(path.join(root,`back/data/${file}.ts`),mocks);
    const model=Object.values(exports).find(x=>x?.getTableName);
    assert.equal(model.getTableName(),table);
  }
  load(path.join(root,'back/data/scopedEnv.ts'),mocks);
  const {TaskModel}=load(path.join(root,'back/data/task.ts'),mocks);
  for(const module of ['runtime','pythonEnvironment','nodeEnvironment']) load(path.join(root,`back/data/${module}.ts`),mocks);
  await sequelize.sync();
  assert.equal(SchedulerProjectionModel.getTableName(),'SchedulerProjections');
  assert.equal(SubscriptionModel.getTableName(),'Subscriptions');
  const repo=await sequelize.models.Repository.create({name:'fixture',provider:'generic',remote_url:'https://fixture.invalid/a',normalized_url:'fixture.invalid/a'});
  const sub=await SubscriptionModel.create({name:'fixture',repository_id:repo.id});
  const manualDefinition=await TaskModel.create({name:'manual',origin:'MANUAL',arguments:[]});
  const discoveredDefinition=await TaskModel.create({name:'auto',origin:'DISCOVERED',subscription_id:sub.id,discovery_key:'fixture',arguments:[]});
  const manual=await SchedulerProjectionModel.create(new SchedulerProjection({id:manualDefinition.id,name:'manual',command:'task example.py',schedule:'0 0 * * *'}));
  const discovered=await SchedulerProjectionModel.create(new SchedulerProjection({id:discoveredDefinition.id,name:'auto',command:'task fixture/example.py',schedule:'0 0 * * *',sub_id:sub.id}));
  assert.equal(manual.status,discovered.status);assert.equal(discovered.sub_id,sub.id);
  const CronService=load(path.join(root,'back/services/cron.ts'),{
    '../data/cron':{SchedulerProjectionModel,SchedulerProjection,CrontabStatus:{running:0,idle:1,queued:3}},
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
  assert.equal((await SchedulerProjectionModel.findByPk(discovered.id)).status,1);
  const fk=await sequelize.query('PRAGMA foreign_key_list("SchedulerProjections")', {type:Sequelize.QueryTypes.SELECT});assert.equal(fk.length,2);assert.ok(fk.some(x=>x.from==='id'&&x.table==='Tasks'));assert.ok(fk.some(x=>x.from==='env_profile_id'&&x.table==='EnvironmentProfiles'));
});
