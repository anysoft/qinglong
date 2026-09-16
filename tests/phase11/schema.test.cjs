const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,QueryTypes}=require('../phase5/helpers.cjs');
const v7=require('../../back/schema/platform-v7.json');
async function seed(h){for(const o of [...v7.objects].sort((a,b)=>Number(!a.sql.startsWith('CREATE TABLE'))-Number(!b.sql.startsWith('CREATE TABLE'))))await h.db.query(o.sql);await h.db.query('INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',{replacements:v7.metadata});}
const objects=h=>h.db.query("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",{type:QueryTypes.SELECT});
test('Frozen v7 upgrades transactionally to identical fresh v8, retry after rollback',async t=>{
 const fresh=await fixture(t),h=await fixture(t,{initialize:false});await seed(h);
 await h.db.query("INSERT INTO Tasks(id,name,enabled,origin,arguments,schedule,version,createdAt,updatedAt) VALUES(1,'preserved',1,'MANUAL','[]','0 9 * * *',3,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 await h.db.query("INSERT INTO TaskExecutionSettings(task_id,createdAt,updatedAt) VALUES(1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 const query=h.db.query.bind(h.db);let injected=false;
 h.db.query=async(sql,...args)=>{if(!injected&&String(sql).includes('ALTER TABLE Tasks DROP COLUMN schedule')){injected=true;throw Error('injected migration failure');}return query(sql,...args);};
 await assert.rejects(h.initializeOperationalSchema(h.db,h.models),/injected/);h.db.query=query;
 assert.equal((await h.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,7);
 assert.equal((await h.db.query('SELECT schedule FROM Tasks',{type:QueryTypes.SELECT}))[0].schedule,'0 9 * * *');
 await h.initializeOperationalSchema(h.db,h.models);
 assert.equal(h.schemaSignature(await objects(h)),fresh.schemaSignature(await objects(fresh)));
 assert.equal((await h.TaskModel.findByPk(1)).version,3);
 assert.equal((await h.CronTriggerModel.findOne()).expression,'0 9 * * *');
 assert.equal((await h.TaskTriggerModel.findOne()).origin,'USER');
 await h.initializeOperationalSchema(h.db,h.models);assert.equal(await h.TaskTriggerModel.count(),1);
 assert.deepEqual(await h.db.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);
});
test('v7 discovered cron ownership and explicit cleared schedule survive migration',async t=>{
 const h=await fixture(t,{initialize:false});await seed(h);
 await h.db.query("INSERT INTO Repositories(id,name,remote_url,normalized_url,provider,host,owner,repository_name,createdAt,updatedAt) VALUES(1,'repo','https://example.invalid/r.git','https://example.invalid/r.git','generic','example.invalid','fixture','r',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 await h.db.query("INSERT INTO Subscriptions(id,repository_id,name,createdAt,updatedAt) VALUES(1,1,'sub',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)");
 for(const [id,schedule] of [[1,'0 8 * * *'],[2,'0 10 * * *'],[3,null]])await h.db.query("INSERT INTO Tasks(id,name,origin,subscription_id,discovery_key,discovery_definition,schedule,createdAt,updatedAt) VALUES(:id,'found','DISCOVERED',1,:key,:definition,:schedule,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)",{replacements:{id,key:'key-'+id,definition:JSON.stringify({name:'found',schedule:'0 8 * * *'}),schedule}});
 await h.initializeOperationalSchema(h.db,h.models);
 const triggers=await h.TaskTriggerModel.findAll({order:[['task_id','ASC']]});assert.equal(triggers.length,3);assert.equal(triggers[0].origin,'DISCOVERY');assert.equal(triggers[1].origin,'USER');assert.equal(triggers[2].origin,'USER');assert.equal(triggers[2].enabled,false);assert.ok(triggers.every(t=>t.discovery_key==='source-cron'));
});
