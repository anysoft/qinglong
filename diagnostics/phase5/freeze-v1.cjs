const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Sequelize,QueryTypes}=require('sequelize');
const load=require('../../test/helpers/load-security-module.cjs');
(async()=>{
 const db=new Sequelize('sqlite::memory:',{logging:false}),cache=new Map(),mocks={'.':{sequelize:db},'../data':{sequelize:db}};
 const exports={};for(const name of ['gitCredential','repository','worktree','scopedEnv','subscription','cron','env','dependence','open','system','cronView','cronStats','runningInstance'])Object.assign(exports,load(path.resolve(`back/data/${name}.ts`),mocks,cache));
 const names=['GitCredentialModel','RepositoryModel','WorktreeModel','EnvironmentProfileModel','SubscriptionModel','CrontabModel','RepositoryEnvVariableModel','TaskEnvVariableModel','EnvModel','DependenceModel','AppModel','SystemModel','CrontabViewModel','CrontabStatModel','RunningInstanceModel'];
 await load(path.resolve('back/shared/operationalSchema.ts')).initializeOperationalSchema(db,names.map(n=>exports[n]));
 const metadata=(await db.query('SELECT * FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0];
 const objects=await db.query("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name",{type:QueryTypes.SELECT});
 fs.mkdirSync('back/schema',{recursive:true});fs.writeFileSync('back/schema/platform-v1.json',JSON.stringify({source_commit:'9a9ad297',metadata,objects},null,2)+'\n');
 await db.close();console.log('Frozen valid platform v1 schema manifest');
})();
