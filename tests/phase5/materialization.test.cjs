const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {fixture}=require('./helpers.cjs');
async function setup(t){const h=await fixture(t);await fs.mkdir(path.join(h.root,'shell'));await fs.copyFile(path.resolve('shell/config_link.py'),path.join(h.root,'shell/config_link.py'));const assets=new(h.load('back/services/configAsset.ts').default)(),service=new(h.load('back/services/configMaterialization.ts').default)(assets);const asset=await assets.save({name:'config',is_secret:true,content:'private config 🌱'}),revision=(await assets.revisions(asset.id))[0].get({plain:true});const workspace={workspaceRoot:h.config.scriptPath,taskDir:h.config.scriptPath,cwd:h.config.scriptPath,resourceKey:crypto.createHash('sha256').update(h.config.scriptPath).digest('hex')},lease={resourceKey:workspace.resourceKey,exclusive:true,assertHeld:async()=>{}};const resolved=(extra={})=>({asset_id:asset.id,revision_id:revision.id,revision,is_secret:true,asset_name:asset.name,source:'TASK',binding:{target_base:'TASK_DIR',target_path:'config.yaml',materialization_mode:'COPY',conflict_policy:'FAIL_IF_EXISTS',writable:false,...extra}});return {...h,assets,service,asset,revision,workspace,lease,resolved};}
for(const mode of ['COPY','SYMLINK'])for(const writable of [false,true])test(`${mode} readonly=${!writable}, per-run copy, canonical immutable and cleanup`,async t=>{
 const h=await setup(t),target=path.join(h.config.scriptPath,'config.yaml'),run=await h.service.prepare(h.workspace,[h.resolved({materialization_mode:mode,writable})],h.lease);
 assert.equal(await fs.readFile(target,'utf8'),'private config 🌱');assert.equal((await fs.stat(target)).mode&0o777,writable?0o600:0o400);
 if(mode==='SYMLINK'){const link=await fs.readlink(target);assert.ok(link.startsWith(run.directory));assert.ok(!link.includes('config-assets'));}
 if(writable)await fs.writeFile(target,'ephemeral');assert.equal((await h.assets.readRevision(h.revision)).toString(),'private config 🌱');
 await run.cleanup();await assert.rejects(fs.lstat(target),{code:'ENOENT'});
});
test('replace restores original exact bytes/mode after simulated process loss and next acquire',async t=>{
 const h=await setup(t),target=path.join(h.config.scriptPath,'config.yaml'),original=Buffer.from([0,1,255,13,10]);await fs.writeFile(target,original,{mode:0o640});
 await assert.rejects(h.service.prepare(h.workspace,[h.resolved()],h.lease),{code:'CONFIG_TARGET_EXISTS'});assert.deepEqual(await fs.readFile(target),original);
 await h.service.prepare(h.workspace,[h.resolved({conflict_policy:'REPLACE_RESTORE'})],h.lease);
 const restarted=new(h.load('back/services/configMaterialization.ts').default)(h.assets);await restarted.recover(h.workspace,h.lease);
 assert.deepEqual(await fs.readFile(target),original);assert.equal((await fs.stat(target)).mode&0o777,0o640);
 assert.deepEqual(await fs.readdir(await h.service.journalRoot(h.workspace)),[]);
});
test('unsafe paths, symlink parents/targets, special files, duplicate physical aliases fail without touching user data',async t=>{
 const h=await setup(t),{targetPath}=h.load('back/shared/configAssets.ts');
 for(const value of ['../escape','/etc/test','.git','.git/config','a/.GIT/test','a//b','a/./b','x\0y','.platform-private','a'.repeat(256),'a\\b'])assert.throws(()=>targetPath(value),{code:'CONFIG_TARGET_INVALID'});
 assert.equal(targetPath('配置/cafe\u0301.json'),'配置/café.json');
 const outside=path.join(h.root,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'saved'),'original');await fs.symlink(outside,path.join(h.config.scriptPath,'parent'));
 await assert.rejects(h.service.prepare(h.workspace,[h.resolved({target_path:'parent/saved',conflict_policy:'REPLACE_RESTORE'})],h.lease),{code:'CONFIG_UNSAFE_PATH'});assert.equal(await fs.readFile(path.join(outside,'saved'),'utf8'),'original');
 await fs.symlink(path.join(outside,'saved'),path.join(h.config.scriptPath,'config.yaml'));
 await assert.rejects(h.service.prepare(h.workspace,[h.resolved({conflict_policy:'REPLACE_RESTORE'})],h.lease),{code:'CONFIG_TARGET_UNSAFE'});await fs.unlink(path.join(h.config.scriptPath,'config.yaml'));
 execFileSync('mkfifo',[path.join(h.config.scriptPath,'config.yaml')]);await assert.rejects(h.service.prepare(h.workspace,[h.resolved({conflict_policy:'REPLACE_RESTORE'})],h.lease),{code:'CONFIG_TARGET_UNSAFE'});await fs.unlink(path.join(h.config.scriptPath,'config.yaml'));
 await assert.rejects(h.service.prepare(h.workspace,[h.resolved(),h.resolved({target_base:'WORKSPACE_ROOT'})],h.lease),{code:'CONFIG_TARGET_CONFLICT'});await assert.rejects(fs.lstat(path.join(h.config.scriptPath,'config.yaml')),{code:'ENOENT'});
 await assert.rejects(h.service.prepare(h.workspace,[h.resolved()],{...h.lease,exclusive:false}),{code:'CONFIG_EXCLUSIVE_LEASE_REQUIRED'});
});
test('unexpected replacement is preserved with backup and recoverable journal',async t=>{
 const h=await setup(t),target=path.join(h.config.scriptPath,'config.yaml');await fs.writeFile(target,'original');const run=await h.service.prepare(h.workspace,[h.resolved({conflict_policy:'REPLACE_RESTORE'})],h.lease);
 await fs.rename(target,target+'.moved');await fs.writeFile(target,'unexpected user file');
 await assert.rejects(run.cleanup(),{code:'CONFIG_RECOVERY_REQUIRED'});assert.equal(await fs.readFile(target,'utf8'),'unexpected user file');assert.equal(await fs.readFile(path.join(run.directory,'backup-0'),'utf8'),'original');
 await fs.unlink(target);await h.service.recover(h.workspace,h.lease);assert.equal(await fs.readFile(target,'utf8'),'original');
});
test('pinned revision remains old through asset edit; next resolve sees new revision',async t=>{
 const h=await setup(t),target=path.join(h.config.scriptPath,'config.yaml'),run=await h.service.prepare(h.workspace,[h.resolved()],h.lease);
 await h.assets.save({...h.asset,expected_version:h.asset.version,content:'next revision'});assert.equal(await fs.readFile(target,'utf8'),'private config 🌱');await run.cleanup();
 const revision=(await h.assets.revisions(h.asset.id))[0].get({plain:true}),next=await h.service.prepare(h.workspace,[{...h.resolved(),revision,revision_id:revision.id}],h.lease);assert.equal(await fs.readFile(target,'utf8'),'next revision');await next.cleanup();
});
test('recovery rejects a journal task root outside the leased workspace without writing outside',async t=>{
 const h=await setup(t),target=path.join(h.config.scriptPath,'config.yaml');await fs.writeFile(target,'ORIGINAL');const run=await h.service.prepare(h.workspace,[h.resolved({conflict_policy:'REPLACE_RESTORE'})],h.lease),file=path.join(run.directory,'journal.json'),valid=await fs.readFile(file,'utf8'),journal=JSON.parse(valid),outside=path.join(h.root,'outside');await fs.mkdir(outside);journal.workspace.taskDir=outside;journal.entries[0].root=outside;await fs.writeFile(file,JSON.stringify(journal));await assert.rejects(h.service.recover(h.workspace,h.lease),{code:'CONFIG_RECOVERY_REQUIRED'});assert.deepEqual(await fs.readdir(outside),[]);assert.equal(await fs.readFile(path.join(run.directory,'backup-0'),'utf8'),'ORIGINAL');await fs.writeFile(file,valid);await h.service.recover(h.workspace,h.lease);assert.equal(await fs.readFile(target,'utf8'),'ORIGINAL');
});
