const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {Sequelize,QueryTypes}=require('sequelize');
const load=require('../../test/helpers/load-security-module.cjs');
async function fixture(t,{initialize=true}={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'platform-phase5-'));
 const db=new Sequelize({dialect:'sqlite',storage:path.join(root,'database.sqlite'),logging:false});
 const config={rootPath:root,dataPath:root,dbPath:root,scriptPath:path.join(root,'scripts')};
 const cache=new Map(),mocks={'.':{sequelize:db},'../data':{sequelize:db},'../config':{default:config,__esModule:true}};
 const modules={},all={};
 for(const name of ['gitCredential','repository','worktree','scopedEnv','subscription','cron','env','dependence','open','system','cronView','cronStats','runningInstance','configAsset','runtime','pythonEnvironment','nodeEnvironment','task']) {
  const m=load(path.resolve(`back/data/${name}.ts`),mocks,cache);modules[name]=m;Object.assign(all,m);mocks['../data/'+name]=m;
 }
 const names=['GitCredentialModel','RepositoryModel','WorktreeModel','EnvironmentProfileModel','SubscriptionModel','SchedulerProjectionModel','RepositoryEnvVariableModel','TaskEnvVariableModel','EnvModel','DependenceModel','AppModel','SystemModel','TaskViewModel','TaskStatModel','RunningInstanceModel'];
 const models=[...names.map(n=>all[n]),...all.configAssetModels,...all.runtimeModels,...all.pythonEnvironmentModels,...all.nodeEnvironmentModels,...all.taskModels];
 const schema=load(path.resolve('back/shared/operationalSchema.ts'),mocks,cache);
 if(initialize)await schema.initializeOperationalSchema(db,models);
 require('../phase9/task-fixture.cjs')(all,db,()=>({scriptRoot:path.join(root,'scripts'),namespace:config.fixturePublicationNamespace}));
 await fs.mkdir(config.scriptPath,{mode:0o700});
 t.after(async()=>{await db.close();await fs.rm(root,{recursive:true,force:true});});
 return {root,db,config,models,modules,...all,...schema,mocks,load:file=>load(path.resolve(file),mocks,cache)};
}
async function seedV1(h){
 const manifest=require('../../back/schema/platform-v1.json');
 for(const item of [...manifest.objects].sort((a,b)=>(a.sql.startsWith('CREATE TABLE')?0:1)-(b.sql.startsWith('CREATE TABLE')?0:1)))await h.db.query(item.sql);
 await h.db.query('INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',{replacements:manifest.metadata});
}
module.exports={fixture,seedV1,QueryTypes};
