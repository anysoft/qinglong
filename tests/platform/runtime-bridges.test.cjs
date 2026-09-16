const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const load=require('../../test/helpers/load-security-module.cjs');
const root=path.resolve(__dirname,'../..');
const logger={info(){},error(){},warn(){}};
test('real node-schedule trigger reaches production runTask and drains stdout/stderr', {timeout:6000},async()=>{
  const Schedule=load(path.join(root,'back/services/schedule.ts'),{
    '../shared/pLimit':{runWithSubscriptionLimit:(_,fn)=>fn()},
  }).default;
  const service=new Schedule(logger);let out='';let errors='';let finish;
  const done=new Promise(resolve=>{finish=resolve;});
  await service.createCronTask({id:987,command:"printf 'baseline-out'; printf 'baseline-err' >&2",schedule:new Date(Date.now()+150),runOrigin:'subscription'},
    {onLog:async s=>{out+=s;},onError:async s=>{errors+=s;},onEnd:async()=>finish()});
  await done;await service.cancelCronTask({id:987});assert.equal(out,'baseline-out');assert.equal(errors,'baseline-err');
});
