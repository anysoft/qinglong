const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,QueryTypes}=require('../phase5/helpers.cjs');
const v4=require('../../back/schema/platform-v4.json');
async function seed(h){for(const o of [...v4.objects].sort((a,b)=>Number(!a.sql.startsWith('CREATE TABLE'))-Number(!b.sql.startsWith('CREATE TABLE'))))await h.db.query(o.sql);await h.db.query('INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',{replacements:v4.metadata});}
test('v4 → v5 preserves real Python environment references; fresh matches migration and late failure rolls back',async t=>{
 const h=await fixture(t,{initialize:false});await seed(h);
 const p=await h.RuntimeProviderModel.create({language:'PYTHON',provider_type:'PYENV',state:'READY',install_root:'runtime/python/pyenv'});
 const r=await h.RuntimeInstallationModel.create({provider_id:p.get('id'),language:'PYTHON',implementation:'CPYTHON',version:'3.13.15',state:'READY',executable_relative_path:'bin/python'});
 const e=await h.PythonEnvironmentModel.create({name:'retained',runtime_id:r.get('id'),state:'EMPTY'});
 const rev=await h.PythonEnvironmentRevisionModel.create({environment_id:e.get('id'),runtime_id:r.get('id'),dependencies:[],spec_hash:'frozen'});
 await e.update({current_revision_id:rev.get('id')});
 const original=h.db.query.bind(h.db);h.db.query=async(sql,...args)=>{if(String(sql).startsWith('CREATE TRIGGER node_build_snapshot_immutable'))throw Error('late fault');return original(sql,...args);};
 await assert.rejects(h.initializeOperationalSchema(h.db,h.models),/late fault/);h.db.query=original;
 assert.equal((await h.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,4);
 assert.equal((await h.PythonEnvironmentModel.findByPk(e.get('id'))).get('current_revision_id'),rev.get('id'));
 await h.initializeOperationalSchema(h.db,h.models);const migrated=(await h.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0];assert.equal(migrated.platform_schema_version,6);
 assert.deepEqual(await h.db.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);assert.equal(await h.PythonEnvironmentRevisionModel.count(),1);
 const fresh=await fixture(t);assert.deepEqual((await fresh.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0],migrated);await h.initializeOperationalSchema(h.db,h.models);
});
test('v4 tampering is rejected without mutation',async t=>{const h=await fixture(t,{initialize:false});await seed(h);await h.db.query('CREATE TABLE unexpected (x INT)');await assert.rejects(h.initializeOperationalSchema(h.db,h.models),/UNSUPPORTED_DATABASE_SCHEMA/);assert.equal((await h.db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,4);});
test('Node actual SQLite constraints protect language/toolchain and immutable revision/build ownership',async t=>{
 const h=await fixture(t),p=await h.RuntimeProviderModel.create({language:'NODE',provider_type:'NODE_DISTRIBUTION',state:'READY',install_root:'runtime/node'}),r=await h.RuntimeInstallationModel.create({provider_id:p.get('id'),language:'NODE',implementation:'NODEJS',version:'22.19.0',state:'READY',executable_relative_path:'bin/node'});
 const tool=await h.NodePackageManagerToolchainModel.create({runtime_id:r.get('id'),manager_type:'PNPM',version:'10.17.1',state:'READY'}),env=await h.NodeEnvironmentModel.create({name:'node',runtime_id:r.get('id'),toolchain_id:tool.get('id'),state:'EMPTY'});
 const rev=await h.NodeEnvironmentRevisionModel.create({environment_id:env.get('id'),runtime_id:r.get('id'),toolchain_id:tool.get('id'),dependencies:[],spec_hash:'s'});
 await assert.rejects(rev.update({spec_hash:'changed'}));await assert.rejects(h.NodeEnvironmentRevisionModel.create({environment_id:env.get('id'),runtime_id:r.get('id'),toolchain_id:tool.get('id'),dependencies:[{name:'x'},{name:'x'}],spec_hash:'s'}));
 const build=await h.NodeEnvironmentBuildModel.create({environment_id:env.get('id'),revision_id:rev.get('id'),runtime_id:r.get('id'),toolchain_id:tool.get('id'),state:'READY',health:'HEALTHY',lock_hash:'hash'});
 await assert.rejects(build.update({lockfile:'changed'}));await assert.rejects(build.update({state:'INSTALLING'}));await assert.rejects(r.destroy());await assert.rejects(tool.destroy());
 const other=await h.NodeEnvironmentModel.create({name:'other',runtime_id:r.get('id'),toolchain_id:tool.get('id'),state:'EMPTY'});await assert.rejects(other.update({current_build_id:build.get('id')}));
 await assert.rejects(h.RuntimeInstallationModel.create({provider_id:p.get('id'),language:'PYTHON',implementation:'CPYTHON',version:'3.13.15',state:'READY',executable_relative_path:'bin/python'}));
});
