const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const load = require('../helpers/load-security-module.cjs');
const { normalizeRetentionPolicy } = load('back/shared/retention.ts');

test('subscription retention defaults to disabled and bounds days', () => {
  assert.deepEqual(normalizeRetentionPolicy({}), { logRetentionDays: 0 });
  for (const [input, expected] of [[-1,0],[NaN,0],[Infinity,0],[99999,3650],[2.9,2]])
    assert.deepEqual(normalizeRetentionPolicy({logRetentionDays:input}), {logRetentionDays:expected});
});

test('retention protects active syncs, TaskRun logs, user files, historical data and symlinks', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'platform-retention-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const logPath=path.join(root,'log'); await fs.mkdir(logPath);
  const candidates=['subscription-1/2000-01-01-00-00-00.log', 'subscription-2/2000-01-01-00-00-00.log',
    'task-runs/run-1.log','user-files/2000-01-01-00-00-00.log','subscription-1/user.log','subscription-1/2026-09-16-00-00-00.log'];
  for(const name of candidates){const file=path.join(logPath,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'keep');if(!name.includes('2026-'))await fs.utimes(file,new Date(0),new Date(0));}
  const outside=path.join(root,'outside');await fs.mkdir(outside);const victim=path.join(outside,'2000-01-01-00-00-00.log');await fs.writeFile(victim,'secret');await fs.utimes(victim,new Date(0),new Date(0));
  await fs.symlink(outside,path.join(logPath,'subscription-3'));
  await fs.symlink(victim,path.join(logPath,'subscription-1/2000-01-01-00-00-01.log'));
  let barrier=0;
  const Retention=load('back/services/retention.ts',{
    '../config':{logPath}, '../data/subscription':{SubscriptionModel:{findAll:async()=>[{id:2}]},SubscriptionStatus:{running:0,queued:3}},
    './backup/platform':{platformBarrier:async()=>({mutation:async fn=>{barrier++;return fn();}})},
  }).default;
  const service=new Retention();
  assert.equal((await service.preview({logRetentionDays:0})).files.length,0);
  const preview=await service.preview({logRetentionDays:1});assert.deepEqual(preview.files.map(x=>x.path),[candidates[0]]);
  assert.equal(await fs.readFile(path.join(logPath,candidates[0]),'utf8'),'keep');
  assert.deepEqual(await service.cleanup({logRetentionDays:1}),{deleted:1,bytes:4});assert.equal(barrier,1);
  for(const name of candidates.slice(1))assert.equal(await fs.readFile(path.join(logPath,name),'utf8'),'keep');
  assert.equal(await fs.readFile(victim,'utf8'),'secret');
  assert.deepEqual(await service.cleanup({logRetentionDays:1}),{deleted:0,bytes:0});
  service.configure(0,{warn(){throw Error('unexpected');}});
});
