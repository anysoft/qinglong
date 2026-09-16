const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),os=require('node:os');
const load=require('../../test/helpers/load-security-module.cjs');
test('fresh directories contain no staging or global dependencies; existing user data is preserved',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'platform-fresh-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const {bootstrapDirectories}=load('back/shared/bootstrapDirectories.ts');
 await bootstrapDirectories(root);
 for(const name of ['scripts','deps','dep_cache','bak'])assert.equal(sync.existsSync(path.join(root,name)),false);
 for(const name of ['db','config','log','worktrees','git'])assert.ok((await fs.stat(path.join(root,name))).isDirectory());
 for(const name of ['scripts','deps','dep_cache','bak']){await fs.mkdir(path.join(root,name));await fs.writeFile(path.join(root,name,'owned-by-user'),'keep');}
 await bootstrapDirectories(root);
 for(const name of ['scripts','deps','dep_cache','bak'])assert.equal(await fs.readFile(path.join(root,name,'owned-by-user'),'utf8'),'keep');
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'platform-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
 await fs.rm(path.join(root,'upload'),{recursive:true});await fs.symlink(outside,path.join(root,'upload'));
 await assert.rejects(bootstrapDirectories(root),/UNSAFE_DATA_DIRECTORY/);
});
test('retired execution, package and loopback entrypoints are physically absent',()=>{
 for(const file of ['shell/task.sh','shell/otask.sh','shell/api.sh','shell/share.sh','shell/update.sh','shell/start.sh','shell/node_path_cache.sh','shell/task_env.sh','back/token.ts','back/taskExecution.ts','back/services/taskExecutionPreparation.ts','back/services/taskExecutionSourceBridge.ts','back/services/taskWorkspace.ts','back/services/cron.ts','back/services/dependence.ts','back/api/cron.ts','back/api/script.ts','back/api/dependence.ts','back/api/update.ts','back/protos/cron.proto'])assert.equal(sync.existsSync(file),false,file);
 for(const file of ['shell/runtime_lease.py','shell/hook_process.py','shell/process_group.py','shell/workspace_rename.py','back/services/configMaterialization.ts'])assert.ok(sync.existsSync(file),file);
 const proto=sync.readFileSync('back/protos/api.proto','utf8');assert.doesNotMatch(proto,/rpc\s+\w*Cron|message\s+Cron/);
 const boot=sync.readFileSync('back/loaders/initData.ts','utf8')+sync.readFileSync('back/loaders/initFile.ts','utf8');assert.doesNotMatch(boot,/SchedulerProjection|RunningInstance|DependenceModel|sendNotify|lang_env|AppModel\.create/);
 assert.equal(JSON.parse(sync.readFileSync('package.json')).bin,undefined);
});
