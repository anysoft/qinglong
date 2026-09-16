const path=require('node:path'),{Sequelize}=require('sequelize'),load=require('../../test/helpers/load-security-module.cjs');
async function attach(root){
 const db=new Sequelize({dialect:'sqlite',storage:path.join(root,'database.sqlite'),logging:false,retry:{max:10,match:['SQLITE_BUSY: database is locked']}});
 const config={rootPath:process.cwd(),dataPath:root,dbPath:root,scriptPath:path.join(root,'scripts')},cache=new Map(),mocks={'.':{sequelize:db},'../data':{sequelize:db},'../config':{default:config,__esModule:true},'../loaders/logger':{default:{info(){},warn(){},error(){},debug(){}},__esModule:true}},all={};
 for(const name of ['gitCredential','repository','worktree','scopedEnv','subscription','cron','env','dependence','open','system','cronView','cronStats','runningInstance','configAsset','runtime','pythonEnvironment','nodeEnvironment','task','taskRun']){const m=load(path.resolve('back/data/'+name+'.ts'),mocks,cache);Object.assign(all,m);mocks['../data/'+name]=m;}
 const module=file=>load(path.resolve(file),mocks,cache),Paths=module('back/services/executionPaths.ts').default,Service=module('back/services/executionService.ts').default,execution=new Service(new Paths(root));
 return {root,db,execution,paths:execution.paths,...all,load:module,close:async()=>{await execution.stop();await db.close();}};
}
module.exports={attach};
