const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture,task}=require('../phase10/helpers.cjs');
test('Discovery preview read-only, ownership overrides and source retirement',async t=>{
 const h=await fixture(t),{repository,worktree,root}=await task(h);
 const sub=await h.SubscriptionModel.create({repository_id:repository.id,worktree_id:worktree.id,name:'discovery'});
 await fs.writeFile(path.join(root,'main.sh'),'# name: Original\n# cron: 0 8 * * *\nprintf test\n');
 const service=new(h.load('back/services/discovery.ts').default)(),triggers=new(h.load('back/services/taskTrigger.ts').default)();
 const preview=await service.preview(sub.id);assert.equal(preview.changes[0].action,'CREATE');assert.equal(await h.TaskModel.count(),1);assert.equal(await h.DiscoveryPolicyModel.count(),0);
 await service.reconcile(sub.id);const discovered=await h.TaskModel.findOne({where:{subscription_id:sub.id}});assert.equal(discovered.name,'Original');assert.equal(discovered.enabled,true);
 const cron=(await triggers.list(discovered.id))[0];assert.equal(cron.origin,'DISCOVERY');
 await triggers.save(discovered.id,{type:'CRON',config:{expression:'0 10 * * *',timezone:'UTC'},expected_version:cron.version},cron.id);
 await discovered.update({name:'User title',arguments:['user'],enabled:false});
 await fs.writeFile(path.join(root,'main.sh'),'# name: Source title\n# cron: 0 12 * * *\nprintf changed\n');
 await service.reconcile(sub.id);await discovered.reload();assert.equal(discovered.name,'User title');assert.deepEqual(discovered.arguments,['user']);assert.equal(discovered.enabled,false);
 const owned=await triggers.list(discovered.id);assert.equal(owned.length,1);assert.equal(owned[0].config.expression,'0 10 * * *');
 await fs.rm(path.join(root,'main.sh'));await service.reconcile(sub.id);assert.equal(await h.TaskModel.count({where:{id:discovered.id}}),1);assert.equal((await triggers.list(discovered.id))[0].origin,'USER');
});
