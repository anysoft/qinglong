const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const load=require('../../test/helpers/load-security-module.cjs');
test('fresh seed is local, idempotent and creates no usable password or legacy startup task',async()=>{
  const rows=new Map(),apps=[],calls=[];
  const systemModel={findOrCreate:async({where})=>{
    if(!rows.has(where.type)) {const row={id:rows.size+1,type:where.type,info:null,update:async value=>Object.assign(row,value)};rows.set(where.type,row)}
    return [rows.get(where.type)];
  }};
  const cron={autosave_crontab:async()=>calls.push('scheduler projection')};
  const env={set_envs:async()=>calls.push('environment bridge')};
  const user={getAuthInfo:async()=>rows.get('authConfig').info};
  const open={findApps:async()=>apps};
  const services=new Map();
  for(const [name,value] of [['cron',cron],['env',env],['user',user],['open',open]]) services.set(name,value);
  const mocks={
    typedi:{Container:{get:key=>services.get(key)}},
    '../services/cron':'cron','../services/env':'env','../services/user':'user','../services/open':'open',
    '../data/cron':{SchedulerProjectionModel:{update:async()=>calls.push('reset task status')},CrontabStatus:{idle:1}},
    '../data/cronView':{TaskViewModel:{findAll:async()=>[{}]},CronViewType:{系统:0}},
    '../data/env':{initPosition:100},
    '../data/dependence':{DependenceModel:{update:async(value,options)=>{
      assert.deepEqual(value,{status:7});assert.deepEqual(options,{where:{status:[0,3,6]}});calls.push('cancel interrupted dependency jobs');
    }},DependenceStatus:{cancelled:7,installing:0,removing:3,queued:6}},
    '../data/system':{SystemModel:systemModel,AuthDataType:{systemConfig:'systemConfig',notification:'notification',authConfig:'authConfig'}},
    '../data/open':{AppModel:{findOne:async()=>apps[0]?{get:()=>apps[0]}:null,create:async value=>{apps.push(value);return value}}},
    '../data/runningInstance':{RunningInstanceModel:{update:async()=>calls.push('reset run status')},InstanceStatus:{stopped:2,running:1}},
    '../config':{langEnvFile:'/unused/lang_env.sh'},
    '../config/util':{createRandomString:()=> 'random-test-only',fileExist:async()=>true},
    '../shared/i18n':{setLang:()=>{},systemLang:()=> 'en'},
    '../shared/store':{shareStore:{updateAuthInfo:async()=>{},updateApps:async()=>{}}},
    './logger':{warn:()=>{}},
    '../schedule/client':{readiness:{configure:()=>{},recover:async()=>calls.push('scheduler recovery')}},
    child_process:{exec:()=>{throw new Error('network/legacy execution prohibited')}},
    'fs/promises':{readFile:()=>{throw new Error('auth.json import prohibited')},writeFile:()=>{throw new Error('unexpected file write')}},
  };
  const initialize=load(path.resolve('back/loaders/initData.ts'),mocks).default;
  await initialize();await initialize();
  assert.equal(rows.size,3);assert.equal(apps.length,1);
  assert.deepEqual(rows.get('authConfig').info,{initialized:false,username:'',password:'',token:'',tokens:{}});
  assert.equal(calls.filter(x=>x==='scheduler recovery').length,0);
  assert.equal(calls.filter(x=>x==='cancel interrupted dependency jobs').length,2);
});
