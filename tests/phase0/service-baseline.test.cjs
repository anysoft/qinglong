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
function envService(rows) {
  const generated={};
  const EnvService=load(path.join(root,'back/services/env.ts'),{
    '../config':{envFile:'env.sh',jsEnvFile:'env.js',pyEnvFile:'env.py'},
    '../data':{sequelize:{literal:x=>x}},
    '../data/env':{EnvStatus:{normal:0,disabled:1}},
    '../shared/utils':{writeFileWithLock:async(p,s)=>{generated[p]=s;}},
  }).default;
  const service=new EnvService(logger);
  service.envs=async(_,query)=>rows.filter(x=>x.status===query.status);
  return {service,generated};
}
test('production ENV generator merges enabled duplicates, omits disabled and invalid names across three languages',async t=>{
  const {service,generated}=envService([
    {name:'BASELINE_ENV',value:'A',status:0},{name:'BASELINE_ENV',value:'B',status:0},
    {name:'DISABLED_ENV',value:'hidden',status:1},{name:'bad-name',value:'no',status:0},
  ]);
  await service.set_envs();
  const context={process:{env:{}}};vm.runInNewContext(generated['env.js'],context);
  assert.equal(context.process.env.BASELINE_ENV,'A&B');assert.equal(context.process.env.DISABLED_ENV,undefined);
  for(const value of Object.values(generated)){assert.doesNotMatch(value,/hidden|bad-name/);}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ql-phase0-env-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'env.py'),generated['env.py']);
  const py=spawnSync('python3',['-c','import env,os; print(os.getenv("BASELINE_ENV")); print(os.getenv("DISABLED_ENV", "missing"))'],{cwd:dir,encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(py.status,0,py.stderr);assert.equal(py.stdout,'A&B\nmissing\n');
  const sh=spawnSync('/bin/bash',['-c',generated['env.sh']+'printf "%s\\n%s\\n" "$BASELINE_ENV" "${DISABLED_ENV-missing}"'],{encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(sh.status,0,sh.stderr);assert.equal(sh.stdout,'A&B\nmissing\n');
});
test('characterization: JavaScript ENV evaluates template expressions; Shell preserves literal',async()=>{
  const {service,generated}=envService([{name:'MARKER',value:'${6*7}',status:0}]);await service.set_envs();
  const context={process:{env:{}}};vm.runInNewContext(generated['env.js'],context);
  assert.equal(context.process.env.MARKER,'42');assert.match(generated['env.sh'],/\$\{6\*7\}/);
});
test('characterization: shell trims combined ENV; JS preserves surrounding whitespace',async()=>{
  const {service,generated}=envService([{name:'MARKER',value:' A ',status:0}]);await service.set_envs();
  assert.equal(generated['env.sh'],"export MARKER='A'\n");
  const context={process:{env:{}}};vm.runInNewContext(generated['env.js'],context);assert.equal(context.process.env.MARKER,' A ');
});
test('Subscription command preserves legacy argument order, embedded credentials and flags',()=>{
  const {formatCommand,formatUrl}=load(path.join(root,'back/config/subscription.ts'));
  const doc={id:42,type:'private-repo',url:'https://example.invalid/owner/repo.git',alias:'alias',pull_type:'user-pwd',pull_option:{username:'user',password:'dummy'},branch:'feature',whitelist:'python',blacklist:'skip',dependences:'helper',extensions:'py',autoAddCron:1,autoDelCron:0};
  assert.equal(formatUrl(doc).url,'https://user:dummy@example.invalid/owner/repo.git');
  assert.equal(formatCommand(doc),'SUB_ID=42 ql repo "https://user:dummy@example.invalid/owner/repo.git" "python" "skip" "helper" "feature" "py" "" "true" "false"');
});
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
