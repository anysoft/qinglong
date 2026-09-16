const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {runtimeFixture}=require('../phase6/helpers.cjs');
test('Environment ownership refuses symlinks, replaced roots, foreign IDs, unknown files and lease collisions',async t=>{
 const h=await runtimeFixture(t),Paths=h.load('back/services/pythonEnvironmentPaths.ts').default,paths=new Paths(h.paths);
 const build={id:1,environment_id:1,runtime_id:1,state:'QUEUED',metadata:{}};
 const location=await paths.build(build,true);await assert.rejects(paths.build(build,true),{error_code:'PYTHON_ENV_RECOVERY_REQUIRED'});
 await assert.rejects(paths.build({...build,runtime_id:2}),{error_code:'PYTHON_ENV_OWNERSHIP_INVALID'});
 const original=await fs.readFile(location.marker,'utf8');await fs.rm(location.marker);const foreign=path.join(h.root,'foreign');await fs.writeFile(foreign,original);await fs.symlink(foreign,location.marker);await assert.rejects(paths.removeBuild(build));assert.ok(await fs.stat(location.root));await fs.rm(location.marker);await fs.writeFile(location.marker,original);
 const a=await paths.lock(1,'build','shared'),b=await paths.lock(1,'build','shared');await assert.rejects(paths.lock(1,'build'),{error_code:'PYTHON_ENV_BUSY'});await a.release();await b.release();const c=await paths.lock(1,'build');await c.release();
 await fs.rename(location.root,location.root+'-saved');await fs.mkdir(location.root);await assert.rejects(paths.removeBuild(build),{error_code:'PYTHON_ENV_OWNERSHIP_INVALID'});await fs.rmdir(location.root);await fs.rename(location.root+'-saved',location.root);
 await paths.removeBuild(build);await fs.writeFile(path.join(await paths.environment(1),'user-owned'),'keep');await assert.rejects(paths.removeEnvironment(1),{error_code:'PYTHON_ENV_ORPHAN'});assert.equal(await fs.readFile(path.join(await paths.environment(1),'user-owned'),'utf8'),'keep');
 await assert.rejects(paths.environment(-1));await assert.rejects(paths.environment('../../x'));
});
