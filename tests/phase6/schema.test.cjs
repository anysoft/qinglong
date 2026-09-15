const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,QueryTypes}=require('../phase5/helpers.cjs');
const frozen=require('../../back/schema/platform-v2.json');
const objects=h=>h.db.query("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",{type:QueryTypes.SELECT});
async function v2(h){
 for(const x of [...frozen.objects].sort((a,b)=>Number(!a.sql.startsWith('CREATE TABLE'))-Number(!b.sql.startsWith('CREATE TABLE'))))await h.db.query(x.sql);
 await h.db.query('INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',{replacements:frozen.metadata});
}
test('frozen v2 migrates to identical fresh v3, preserves ENV/Config/Hooks and enforces runtime CHECK/FK constraints',async t=>{
 const a=await fixture(t),b=await fixture(t,{initialize:false});await v2(b);
 await b.db.query("INSERT INTO Envs (name,value,createdAt,updatedAt) VALUES ('KEEP','literal 🌱',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 await b.db.query("INSERT INTO ConfigAssets (id,name,createdAt,updatedAt) VALUES (1,'keep',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 await b.db.query("INSERT INTO Crontabs (id,command,createdAt,updatedAt) VALUES (1,'task main.py',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 await b.db.query("INSERT INTO TaskHooks (task_id,name,phase,command,position,failure_policy,createdAt,updatedAt) VALUES (1,'keep','FINALLY','true',10,'CONTINUE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 await b.initializeOperationalSchema(b.db,b.models);
 assert.equal(a.schemaSignature(await objects(a)),b.schemaSignature(await objects(b)));
 assert.equal((await b.db.query('SELECT platform_schema_version FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,3);
 assert.equal((await b.EnvModel.unscoped().findOne()).get('value'),'literal 🌱');assert.equal(await b.ConfigAssetModel.count(),1);assert.equal(await b.TaskHookModel.count(),1);
 await assert.rejects(b.db.query("INSERT INTO RuntimeProviders(language,provider_type,state,install_root,createdAt,updatedAt) VALUES ('NODE','PYENV','READY','python/pyenv',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"),e=>/CHECK constraint/.test(e.parent?.message));
 await assert.rejects(b.db.query("INSERT INTO RuntimeInstallations(provider_id,language,implementation,version,state,executable_relative_path,createdAt,updatedAt) VALUES (999,'PYTHON','CPYTHON','3.12.12','READY','bin/python',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)"),/FOREIGN KEY/);
 assert.deepEqual(await b.db.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);await b.initializeOperationalSchema(b.db,b.models);
});
test('v2 late migration failure rolls back runtime tables, metadata and data, then retries',async t=>{
 const h=await fixture(t,{initialize:false});await v2(h);const before=await objects(h),query=h.db.query;
 h.db.query=function(sql,...args){if(sql==='DROP TABLE PlatformMetadata')throw new Error('INJECTED_V3_FAILURE');return query.call(this,sql,...args);};
 await assert.rejects(h.initializeOperationalSchema(h.db,h.models),/INJECTED_V3_FAILURE/);h.db.query=query;
 assert.deepEqual(await objects(h),before);await h.initializeOperationalSchema(h.db,h.models);
});
test('tampered v2 signature and unknown version fail closed',async t=>{
 for(const alteration of ["UPDATE PlatformMetadata SET model_signature='tampered'","CREATE TABLE user_data (value TEXT)"]){
  const h=await fixture(t,{initialize:false});await v2(h);await h.db.query(alteration);const before=await objects(h);
  await assert.rejects(h.initializeOperationalSchema(h.db,h.models),{code:'UNSUPPORTED_DATABASE_SCHEMA'});assert.deepEqual(await objects(h),before);
 }
});
