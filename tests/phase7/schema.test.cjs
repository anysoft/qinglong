const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,QueryTypes}=require('../phase5/helpers.cjs');
const frozen=require('../../back/schema/platform-v3.json');
const objects=h=>h.db.query("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",{type:QueryTypes.SELECT});
async function seed(h){for(const x of [...frozen.objects].sort((a,b)=>Number(!a.sql.startsWith('CREATE TABLE'))-Number(!b.sql.startsWith('CREATE TABLE'))))await h.db.query(x.sql);await h.db.query('INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',{replacements:frozen.metadata});}
test('frozen v3 to v4 is transactional, preserves runtime/history and equals fresh signature',async t=>{
 const a=await fixture(t),b=await fixture(t,{initialize:false});await seed(b);
 await b.RuntimeProviderModel.create({id:1,language:'PYTHON',provider_type:'PYENV',state:'READY',install_root:'runtime/python/pyenv'});
 await b.RuntimeInstallationModel.create({id:1,provider_id:1,language:'PYTHON',implementation:'CPYTHON',version:'3.13.15',state:'READY',executable_relative_path:'bin/python'});
 await b.RuntimeOperationModel.create({provider_id:1,runtime_id:1,operation_type:'RUNTIME_VERIFY',status:'SUCCESS',stage:'COMPLETE',owner_token:'historical',owner_pid:999999,log_identity:'history',metadata:{preserved:true}});
 const before=await objects(b),query=b.db.query;
 b.db.query=function(sql,...args){if(sql.includes('CREATE TRIGGER python_environment_build_ready_immutable'))throw Error('INJECTED_LATE_V4');return query.call(this,sql,...args);};
 await assert.rejects(b.initializeOperationalSchema(b.db,b.models),/INJECTED_LATE_V4/);b.db.query=query;assert.deepEqual(await objects(b),before);
 await b.initializeOperationalSchema(b.db,b.models);assert.equal(a.schemaSignature(await objects(a)),b.schemaSignature(await objects(b)));
 assert.equal((await b.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,6);
 assert.equal((await b.RuntimeOperationModel.findOne()).get('metadata').preserved,true);assert.equal(await b.RuntimeInstallationModel.count(),1);
 await b.initializeOperationalSchema(b.db,b.models);
});
test('v3 tampering fails closed before any schema or user-data changes',async t=>{
 for(const sql of ["UPDATE PlatformMetadata SET model_signature='bad'","CREATE TABLE user_extension(value TEXT)"]){const h=await fixture(t,{initialize:false});await seed(h);await h.db.query(sql);const before=await objects(h);await assert.rejects(h.initializeOperationalSchema(h.db,h.models),{code:'UNSUPPORTED_DATABASE_SCHEMA'});assert.deepEqual(await objects(h),before);}
});
test('actual SQLite constraints protect immutable revisions, build identity, current ownership and runtime FKs',async t=>{
 const h=await fixture(t);await h.RuntimeProviderModel.create({id:1,language:'PYTHON',provider_type:'PYENV',state:'READY',install_root:'runtime/python/pyenv'});await h.RuntimeInstallationModel.create({id:1,provider_id:1,language:'PYTHON',implementation:'CPYTHON',version:'3.13.15',state:'READY',executable_relative_path:'bin/python'});
 for(const id of [1,2]){await h.PythonEnvironmentModel.create({id,name:'env-'+id,runtime_id:1,state:'EMPTY'});await h.PythonEnvironmentRevisionModel.create({id,environment_id:id,runtime_id:1,dependencies:[],spec_hash:'hash'});await h.PythonEnvironmentBuildModel.create({id,environment_id:id,revision_id:id,runtime_id:1,state:'READY',health:'HEALTHY',resolved_hash:'hash'});}
 await assert.rejects(h.db.query("UPDATE PythonEnvironmentRevisions SET dependencies='[1]' WHERE id=1"),e=>/IMMUTABLE/.test(e.parent?.message));
 await assert.rejects(h.db.query("UPDATE PythonEnvironmentBuilds SET resolved='[1]' WHERE id=1"),e=>/IMMUTABLE/.test(e.parent?.message));
 await assert.rejects(h.db.query('UPDATE PythonEnvironmentBuilds SET environment_id=2 WHERE id=1'),e=>/IMMUTABLE/.test(e.parent?.message));
 await assert.rejects(h.db.query('UPDATE PythonEnvironments SET current_build_id=2 WHERE id=1'),/FOREIGN KEY/);
 await h.db.query('UPDATE PythonEnvironments SET current_build_id=1,current_revision_id=1 WHERE id=1');
 await assert.rejects(h.db.query('DELETE FROM PythonEnvironmentBuilds WHERE id=1'),/FOREIGN KEY/);
 await assert.rejects(h.db.query('DELETE FROM RuntimeInstallations WHERE id=1'),/FOREIGN KEY/);
 await assert.rejects(h.db.query("UPDATE PythonEnvironmentBuilds SET state='BROKEN' WHERE id=1"),e=>/CHECK|IMMUTABLE/.test(e.parent?.message));
});
