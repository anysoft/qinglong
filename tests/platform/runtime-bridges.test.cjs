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
test('dependency command generation retains global Node and optional Python prefix without installing packages',()=>{
  for(const prefix of [undefined,'/tmp/phase0-prefix']) {
    const util=load(path.join(root,'back/config/util.ts'),{
      './index':{}, './const':{PYTHON_INSTALL_DIR:prefix,TASK_COMMAND:'task'},
      '../loaders/logger':logger,'../shared/utils':{},'../data/dependence':{DependenceTypes:{nodejs:0,python3:1,linux:2}},
      './share':{},
    });
    assert.equal(util.getInstallCommand(0,' demo@1 '),'pnpm add -g demo@1');
    assert.equal(util.getInstallCommand(1,' demo==1 '),'pip3 install --disable-pip-version-check --root-user-action=ignore'+(prefix?` --prefix=${prefix}`:'')+' demo==1');
    assert.equal(util.getUninstallCommand(0,'demo'),'pnpm remove -g demo');
    assert.match(util.getGetCommand(1,'demo'),/importlib.metadata/);
  }
});
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
