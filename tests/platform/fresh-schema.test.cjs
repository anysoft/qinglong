const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Sequelize, QueryTypes, DataTypes } = require('sequelize');
const load = require('../../test/helpers/load-security-module.cjs');
const { initializeOperationalSchema } = load(path.resolve('back/shared/operationalSchema.ts'));
const { bootstrapDirectories } = load(path.resolve('back/shared/bootstrapDirectories.ts'));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'platform-schema-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const data = path.join(root,'empty','data');
  await bootstrapDirectories(data);
  const database = new Sequelize({dialect:'sqlite',storage:path.join(data,'db/database.sqlite'),logging:false});
  t.after(()=>database.close());
  const cache = new Map(), mocks = {'.':{sequelize:database},'../data':{sequelize:database}};
  const models = [];
  for (const file of ['gitCredential','repository','worktree','scopedEnv','subscription','cron','env','dependence','open','system','cronView','cronStats','runningInstance','configAsset','runtime','pythonEnvironment','nodeEnvironment','task','taskRun','taskTrigger','discoveryPolicy']) {
    const module = load(path.resolve(`back/data/${file}.ts`),mocks,cache);
    for(const [key,value] of Object.entries(module)) if(key.endsWith('Model')) models.push(value);
  }
  return {root,data,database,models};
}
const schema = database => database.query("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",{type:QueryTypes.SELECT});
test('empty data root creates schema v9 and restarts without schema writes',async t=>{
  const {data,database,models}=await fixture(t);
  await initializeOperationalSchema(database,models);
  const before=await schema(database);
  assert.equal(before.some(x=>x.name==='SchemaMigrations'),false);
  const [metadata]=await database.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT});
  assert.equal(metadata.platform_schema_version,9);
  await initializeOperationalSchema(database,models);
  assert.deepEqual(await schema(database),before);
  assert.deepEqual(await database.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);
  for(const name of ['git','worktrees','.locks','tmp','config']) assert.ok((await fs.stat(path.join(data,name))).isDirectory());
  for(const name of ['repo','raw','scripts','deps','dep_cache','bak']) await assert.rejects(fs.stat(path.join(data,name)),{code:'ENOENT'});
});
test('unknown nonempty database fails closed and preserves rows and schema',async t=>{
  const {database,models}=await fixture(t);
  await database.query('CREATE TABLE unique_user_data (value TEXT)');
  await database.query("INSERT INTO unique_user_data VALUES ('keep')");
  const before=await schema(database);
  await assert.rejects(initializeOperationalSchema(database,models),{code:'UNSUPPORTED_DATABASE_SCHEMA'});
  assert.deepEqual(await schema(database),before);
  assert.deepEqual(await database.query('SELECT value FROM unique_user_data',{type:QueryTypes.SELECT}),[{value:'keep'}]);
});
test('partial DDL failure rolls back all objects and allows a clean retry',async t=>{
  const {database,models}=await fixture(t);
  const bad=models.find(model=>model.tableName==='TaskTriggers');
  const original=bad.sync;
  bad.sync=async()=>{throw new Error('INJECTED_DDL_FAILURE')};
  await assert.rejects(initializeOperationalSchema(database,models),/INJECTED_DDL_FAILURE/);
  assert.deepEqual(await schema(database),[]);
  bad.sync=original;
  await initializeOperationalSchema(database,models);
});
test('unexpected schema objects are rejected on restart',async t=>{
  const {database,models}=await fixture(t);
  await initializeOperationalSchema(database,models);
  await database.query('CREATE TABLE unknown_extension (value TEXT)');
  await assert.rejects(initializeOperationalSchema(database,models),{code:'UNSUPPORTED_DATABASE_SCHEMA'});
});
test('fresh directory bootstrap refuses symlinked database directory',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'platform-dir-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'data')); await fs.mkdir(path.join(root,'outside'));
  await fs.symlink(path.join(root,'outside'),path.join(root,'data/db'));
  await assert.rejects(bootstrapDirectories(path.join(root,'data')),/UNSAFE_DATA_DIRECTORY/);
  assert.deepEqual(await fs.readdir(path.join(root,'outside')),[]);
});
