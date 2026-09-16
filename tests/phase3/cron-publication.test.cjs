const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const load=require('../../test/helpers/load-security-module.cjs');
test('strict Managed crontab install reports errors while original default behavior is preserved',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ql-cron3-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const previous=process.env.QL_SCHEDULER;process.env.QL_SCHEDULER='system';t.after(()=>{if(previous===undefined)delete process.env.QL_SCHEDULER;else process.env.QL_SCHEDULER=previous;});
 const Cron=load('back/services/cron.ts',{
  '../data/cron':{SchedulerProjectionModel:{update:async()=>{}},SchedulerProjection:class {}},'../data/runningInstance':{},'../config':{crontabFile:path.join(dir,'crontab.list')},'../config/util':{},'../config/const':{TASK_PREFIX:'task ',QL_PREFIX:'ql '},'../schedule/client':{},'../shared/pLimit':{},'../shared/utils':{writeFileWithLock:fs.writeFile},'../shared/i18n':{t:x=>x},'../shared/logStreamManager':{},'../shared/schedulerMutationLock':{},'child_process':{...require('node:child_process'),execSync:()=>{throw new Error('fixture install failure');}}
 }).default;const cron=new Cron({error(){}});await cron.setCrontab({data:[],total:0});await assert.rejects(cron.setCrontab({data:[],total:0},true),/fixture install failure/);
});
