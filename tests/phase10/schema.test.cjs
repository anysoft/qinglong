const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture,QueryTypes}=require('../phase5/helpers.cjs');
const v6=require('../../back/schema/platform-v6.json');
async function seed(h){
 for(const object of [...v6.objects].sort((a,b)=>Number(!a.sql.startsWith('CREATE TABLE'))-Number(!b.sql.startsWith('CREATE TABLE'))))await h.db.query(object.sql);
 await h.db.query('INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',{replacements:v6.metadata});
}
const objects=h=>h.db.query("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",{type:QueryTypes.SELECT});
test('actual frozen v6 upgrades to identical fresh latest schema and restarts without schema mutation',async t=>{
 const fresh=await fixture(t),old=await fixture(t,{initialize:false});await seed(old);
 assert.equal(old.schemaSignature(await objects(old)),v6.metadata.schema_signature);
 await old.initializeOperationalSchema(old.db,old.models);
 assert.deepEqual(await objects(old),await objects(fresh));
 const metadata=await old.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT});
 assert.equal(metadata[0].platform_schema_version,8);
 assert.deepEqual(metadata,await fresh.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}));
 await old.initializeOperationalSchema(old.db,old.models);
 assert.deepEqual(await objects(old),await objects(fresh));
});
test('v6 late DDL failure preserves Task and secret rows, then retries',async t=>{
 const h=await fixture(t,{initialize:false});await seed(h);
 await h.TaskModel.create({id:31,name:'preserve',origin:'MANUAL',enabled:false});
 await h.TaskEnvVariableModel.create({task_id:31,name:'PRIVATE_TOKEN',value:'keep-this-private',is_secret:true});
 const before=await objects(h),query=h.db.query.bind(h.db);
 h.db.query=async(sql,...args)=>{if(String(sql).startsWith('CREATE TRIGGER task_active_run_delete_guard'))throw Error('LATE_V7_FAILURE');return query(sql,...args);};
 await assert.rejects(h.initializeOperationalSchema(h.db,h.models),/LATE_V7_FAILURE/);h.db.query=query;
 assert.deepEqual(await objects(h),before);
 assert.equal((await h.TaskModel.findByPk(31)).name,'preserve');
 assert.equal((await h.TaskEnvVariableModel.unscoped().findOne()).value,'keep-this-private');
 await h.initializeOperationalSchema(h.db,h.models);
 assert.equal((await h.TaskEnvVariableModel.unscoped().findOne()).value,'keep-this-private');
 assert.deepEqual(await h.db.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);
});
test('v6 tampered schema fails closed before v7 DDL',async t=>{
 const h=await fixture(t,{initialize:false});await seed(h);await h.db.query('CREATE TABLE user_data(value TEXT)');const before=await objects(h);
 await assert.rejects(h.initializeOperationalSchema(h.db,h.models),/UNSUPPORTED_DATABASE_SCHEMA/);assert.deepEqual(await objects(h),before);
});
test('durable run and attempt constraints preserve history and protect active task',async t=>{
 const h=await fixture(t);const task=await h.TaskModel.create({name:'task'});
 const run=await h.TaskRunModel.create({task_id:task.id,trigger_type:'MANUAL',submitted_at:new Date(),log_identity:'run-test',concurrency_policy:'FORBID'});
 await assert.rejects(task.destroy(),error=>error.parent?.message.includes('TASK_ACTIVE_RUN'));
 await assert.rejects(run.update({status:'BOGUS'}),error=>error.parent?.message.includes('TASK_RUN_STATUS_INVALID'));
 const attempt={task_run_id:run.id,attempt_number:1,status:'RUNNING',started_at:new Date()};
 await h.TaskRunAttemptModel.create(attempt);await assert.rejects(h.TaskRunAttemptModel.create(attempt));
 await assert.rejects(h.TaskRunAttemptModel.create({...attempt,attempt_number:0}),error=>error.parent?.message.includes('TASK_ATTEMPT_FIELDS_INVALID'));
 await h.TaskRunModel.update({status:'SUCCESS'},{where:{id:run.id}});await task.destroy();
 assert.equal((await h.TaskRunModel.findByPk(run.id)).task_id,null);
 assert.equal(await h.TaskRunAttemptModel.count(),1);
});
