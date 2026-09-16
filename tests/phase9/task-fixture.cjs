// Explicit adapter for pre-Phase-9 test DATA, never production or migration code.
// These tests exercise ENV/Config/Hooks/current runner mechanics. Give their
// scheduler projections canonical Task/Source records; runtime declarations are
// SQLite test doubles and do not claim managed interpreter execution.
const path=require('node:path'),crypto=require('node:crypto');
function installTaskFixture(models,db,configuration){
 let serial=0;const environments=new Map();
 const plain=row=>row?.get({plain:true});
 async function runtime(kind,transaction){
  if(kind==='SHELL')return null;
  if(environments.has(kind))return environments.get(kind);
  const language=kind==='NODE'?'NODE':'PYTHON';
  let provider=await models.RuntimeProviderModel.findOne({where:{language},transaction});
  if(!provider)provider=await models.RuntimeProviderModel.create({language,provider_type:kind==='NODE'?'NODE_DISTRIBUTION':'PYENV',state:'READY',install_root:`runtime/${kind.toLowerCase()}/fixture`},{transaction});
  const installation=await models.RuntimeInstallationModel.create({provider_id:provider.get('id'),language,implementation:kind==='NODE'?'NODEJS':'CPYTHON',version:kind==='NODE'?'22.0.0':'3.13.0',state:'READY',executable_relative_path:kind==='NODE'?'bin/node':'bin/python'},{transaction});
  const runtime_id=installation.get('id');let environment;
  if(kind==='PYTHON'){
   environment=await models.PythonEnvironmentModel.create({name:'fixture Python declaration',runtime_id,state:'EMPTY'},{transaction});
   const revision=await models.PythonEnvironmentRevisionModel.create({environment_id:environment.get('id'),runtime_id,dependencies:[],spec_hash:'fixture'},{transaction});
   const build=await models.PythonEnvironmentBuildModel.create({environment_id:environment.get('id'),revision_id:revision.get('id'),runtime_id,state:'READY',health:'HEALTHY',resolved_hash:'fixture'},{transaction});
   await environment.update({state:'READY',current_revision_id:revision.get('id'),current_build_id:build.get('id')},{transaction});
  }else{
   const tool=await models.NodePackageManagerToolchainModel.create({runtime_id,manager_type:'NPM',version:'10.0.0',state:'READY'},{transaction}),toolchain_id=tool.get('id');
   environment=await models.NodeEnvironmentModel.create({name:'fixture Node declaration',runtime_id,toolchain_id,state:'EMPTY'},{transaction});
   const revision=await models.NodeEnvironmentRevisionModel.create({environment_id:environment.get('id'),runtime_id,toolchain_id,dependencies:[],spec_hash:'fixture'},{transaction});
   const build=await models.NodeEnvironmentBuildModel.create({environment_id:environment.get('id'),revision_id:revision.get('id'),runtime_id,toolchain_id,state:'READY',health:'HEALTHY',lock_hash:'fixture'},{transaction});
   await environment.update({state:'READY',current_revision_id:revision.get('id'),current_build_id:build.get('id')},{transaction});
  }
  environments.set(kind,environment.get('id'));return environment.get('id');
 }
 models.SchedulerProjectionModel.addHook('beforeCreate','canonical-test-definition',async(projection,options)=>{
  const transaction=options.transaction;
  if(projection.id&&await models.TaskModel.findByPk(projection.id,{transaction}))return;
  const input=plain(projection),config=configuration();serial++;
  const publicationId=input.sub_id??Number(/^task\s+subscription-(\d+)\//.exec(input.command??'')?.[1]||0);
  let entry=input.source_relative_path||String(input.command??'').replace(/^task\s+/,'').split(/\s/)[0]||'fixture.sh';
  entry=entry.replace(/^subscription-\d+\//,'');
  if(!/\.(?:py|js|mjs|cjs|ts|sh)$/.test(entry)||entry.includes('..')||path.isAbsolute(entry))entry=`fixture-${serial}.sh`;
  let subscription=publicationId?await models.SubscriptionModel.findByPk(publicationId,{transaction}):null;
  let worktree=subscription?.worktree_id?await models.WorktreeModel.findByPk(subscription.worktree_id,{transaction}):null;
  if(!worktree){
   let repository=subscription?.repository_id?await models.RepositoryModel.findByPk(subscription.repository_id,{transaction}):await models.RepositoryModel.findOne({where:{name:'Task fixture repository'},transaction});
   if(!repository)repository=await models.RepositoryModel.create({name:'Task fixture repository',remote_url:'https://fixture.invalid/task-fixture.git',normalized_url:'https://fixture.invalid/task-fixture.git',repository_name:'task-fixture',host:'fixture.invalid',owner:'fixture',provider:'generic',storage_state:'READY'},{transaction});
   const namespace=publicationId?`subscription-${publicationId}`:config.namespace;
   const local_path=namespace?path.join(config.scriptRoot,namespace):config.scriptRoot;
   worktree=await models.WorktreeModel.findOne({where:{repository_id:repository.id,local_path},transaction});
   if(!worktree)worktree=await models.WorktreeModel.create({repository_id:repository.id,name:'Task fixture '+serial,ref_type:'branch',ref_name:'main',lifecycle_state:'READY',local_path},{transaction});
   if(subscription)await subscription.update({worktree_id:worktree.id},{transaction});
   else if(namespace){subscription=await models.SubscriptionModel.findOne({where:{worktree_id:worktree.id},transaction});if(!subscription)subscription=await models.SubscriptionModel.create({...(publicationId?{id:publicationId}:{}),repository_id:repository.id,worktree_id:worktree.id,name:'Runner publication',branch:'main'},{transaction});}
  }
  const discovered=!!input.sub_id;
  const row=await models.TaskModel.create({...(input.id?{id:input.id}:{}),name:input.name||entry,description:'Fixture definition',enabled:input.isDisabled!==1,origin:discovered?'DISCOVERED':'MANUAL',subscription_id:discovered?input.sub_id:null,discovery_key:discovered?(input.discovery_key||crypto.createHash('sha256').update(entry).digest('hex')):null,env_profile_id:input.env_profile_id??null,arguments:[],schedule:input.schedule??null,discovery_definition:input.discovery_definition?{name:input.discovery_definition.name,schedule:input.discovery_definition.schedule}:null},{transaction});
  const language=entry.endsWith('.py')?'PYTHON':entry.endsWith('.sh')?'SHELL':entry.endsWith('.ts')?'TYPESCRIPT':'JAVASCRIPT',kind=language==='PYTHON'?'PYTHON':language==='SHELL'?'SHELL':'NODE';
  await models.TaskSourceModel.create({task_id:row.id,type:'WORKTREE_ENTRYPOINT',worktree_id:worktree.id,relative_entrypoint:entry,language,cwd_mode:'ENTRYPOINT_DIR',cwd_relative_path:null},{transaction});
  const env=await runtime(kind,transaction);
  await models.TaskRuntimeBindingModel.create({task_id:row.id,kind,python_environment_id:kind==='PYTHON'?env:null,node_environment_id:kind==='NODE'?env:null},{transaction});
  await models.TaskExecutionSettingsModel.create({task_id:row.id},{transaction});projection.id=row.id;
  if(config.namespace&&/^task\s+/.test(projection.command)&&!/^task\s+subscription-/.test(projection.command))projection.command='task '+config.namespace+'/'+entry;
 });
}
module.exports=installTaskFixture;
