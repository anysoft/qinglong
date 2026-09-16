const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,seedV1,QueryTypes}=require('./helpers.cjs');
const objects=h=>h.db.query("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",{type:QueryTypes.SELECT});
test('frozen platform v1 upgrades transactionally to identical fresh latest schema and preserves data/hooks',async t=>{
 const fresh=await fixture(t),upgrade=await fixture(t,{initialize:false});await seedV1(upgrade);
 await upgrade.db.query("INSERT INTO Crontabs (id,command,task_before,task_after,createdAt,updatedAt) VALUES (42,'task main.py','printf before','printf after',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 await upgrade.db.query("INSERT INTO Envs (name,value,createdAt,updatedAt) VALUES ('KEEP',' 私有 value 🌱 ',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 await upgrade.initializeOperationalSchema(upgrade.db,upgrade.models);
 assert.equal(upgrade.schemaSignature(await objects(upgrade)),fresh.schemaSignature(await objects(fresh)));
 const meta=await upgrade.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT});assert.equal(meta[0].platform_schema_version,9);
 assert.equal(meta[0].model_signature,(await fresh.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].model_signature);
 assert.deepEqual((await upgrade.TaskHookModel.findAll({order:[['id','ASC']]})).map(x=>[x.get('phase'),x.get('command'),x.get('failure_policy')]),[['BEFORE','printf before','CONTINUE'],['FINALLY','printf after','CONTINUE']]);
 assert.equal((await upgrade.EnvModel.unscoped().findOne()).get('value'),' 私有 value 🌱 ');
 assert.equal((await upgrade.SchedulerProjectionModel.findByPk(42)).get('command'),'task main.py');
 assert.deepEqual(await upgrade.db.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);
 await upgrade.initializeOperationalSchema(upgrade.db,upgrade.models);
 const columns=await upgrade.db.getQueryInterface().describeTable('SchedulerProjections');assert.equal('task_before' in columns,false);assert.equal('task_after' in columns,false);
});
test('migration failure rolls back DDL, data, hooks and version then permits retry',async t=>{
 const h=await fixture(t,{initialize:false});await seedV1(h);const before=await objects(h);
 const query=h.db.query;h.db.query=function(sql,...args){if(/^CREATE TABLE.*TaskHooks/.test(sql))throw new Error('INJECTED');return query.call(this,sql,...args);};
 await assert.rejects(h.initializeOperationalSchema(h.db,h.models),/INJECTED/);h.db.query=query;
 assert.deepEqual(await objects(h),before);assert.equal((await h.db.query('SELECT platform_schema_version FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,1);
 await h.initializeOperationalSchema(h.db,h.models);
});
test('unknown and tampered v1 databases fail closed without touching user rows',async t=>{
 const h=await fixture(t,{initialize:false});await seedV1(h);await h.db.query('CREATE TABLE user_data (value TEXT)');const before=await objects(h);
 await assert.rejects(h.initializeOperationalSchema(h.db,h.models),{code:'UNSUPPORTED_DATABASE_SCHEMA'});assert.deepEqual(await objects(h),before);
});
test('late migration failure after old columns drop restores all v1 data and hook fields',async t=>{
 const h=await fixture(t,{initialize:false});await seedV1(h);await h.db.query("INSERT INTO Crontabs (id,command,task_before,task_after,createdAt,updatedAt) VALUES (42,'task main.sh','echo before','echo after',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 const before=await objects(h),query=h.db.query;h.db.query=function(sql,...args){if(sql==='DROP TABLE PlatformMetadata')throw new Error('LATE_MIGRATION_FAILURE');return query.call(this,sql,...args);};
 await assert.rejects(h.initializeOperationalSchema(h.db,h.models),/LATE_MIGRATION_FAILURE/);h.db.query=query;
 assert.deepEqual(await objects(h),before);assert.deepEqual((await h.db.query('SELECT task_before,task_after FROM Crontabs',{type:QueryTypes.SELECT}))[0],{task_before:'echo before',task_after:'echo after'});await h.initializeOperationalSchema(h.db,h.models);assert.equal(await h.TaskHookModel.count(),2);
});
