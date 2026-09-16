const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture,task}=require('../phase10/helpers.cjs');
test('Discovery transaction failure preserves resource bindings; retirement preserves history and explicit deletion cascades definitions',async t=>{
 const h=await fixture(t),{repository,worktree,root}=await task(h);const sub=await h.SubscriptionModel.create({repository_id:repository.id,worktree_id:worktree.id,name:'integrity'});
 const discovery=new(h.load('back/services/discovery.ts').default)();await discovery.reconcile(sub.id);const owned=await h.TaskModel.findOne({where:{subscription_id:sub.id}});
 const hook=await h.TaskHookModel.create({task_id:owned.id,name:'keep',phase:'FINALLY',command:'echo keep',position:10,failure_policy:'FAIL_EXECUTION'}),asset=await h.ConfigAssetModel.create({name:'keep asset',is_secret:false}),binding=await h.TaskConfigBindingModel.create({task_id:owned.id,asset_id:asset.id,operation:'ATTACH',target_base:'TASK_DIR',target_path:'config.yaml'}),variable=await h.TaskEnvVariableModel.create({task_id:owned.id,name:'KEEP',value:'KEEP_VALUE',operation:'SET'});
 await fs.writeFile(path.join(root,'main.sh'),'# name: changed\nprintf changed');
 const original=h.DiscoveryPolicyModel.upsert;h.DiscoveryPolicyModel.upsert=async()=>{throw Error('late discovery failure');};try{await assert.rejects(discovery.reconcile(sub.id),/late discovery failure/);}finally{h.DiscoveryPolicyModel.upsert=original;}
 assert.notEqual((await owned.reload()).name,'changed');assert.ok(await h.TaskHookModel.findByPk(hook.id));assert.ok(await h.TaskConfigBindingModel.findByPk(binding.id));assert.equal((await h.TaskEnvVariableModel.unscoped().findByPk(variable.id)).value,'KEEP_VALUE');
 await fs.rm(path.join(root,'main.sh'));await discovery.reconcile(sub.id);assert.equal((await owned.reload()).enabled,false);assert.ok(await h.TaskHookModel.findByPk(hook.id));
 const run=await h.TaskRunModel.create({task_id:owned.id,trigger_type:'MANUAL',submitted_at:new Date(),log_identity:'historical-run',concurrency_policy:'FORBID',status:'SUCCESS'});
 await h.taskService.remove(owned.id,owned.version);assert.equal(await h.TaskHookModel.findByPk(hook.id),null);assert.equal(await h.TaskConfigBindingModel.findByPk(binding.id),null);assert.equal(await h.TaskEnvVariableModel.findByPk(variable.id),null);assert.equal((await run.reload()).task_id,null);assert.ok(await h.ConfigAssetModel.findByPk(asset.id));
});
