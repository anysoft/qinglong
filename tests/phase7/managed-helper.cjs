const fs=require('node:fs/promises'),path=require('node:path'),{Sequelize}=require('sequelize');
const load=require('../../test/helpers/load-security-module.cjs');
async function attach(root,index){
 const db=new Sequelize({dialect:'sqlite',storage:path.join(root,'database.sqlite'),logging:false});
 const config={rootPath:root,dataPath:root,dbPath:root,scriptPath:path.join(root,'scripts')},cache=new Map(),mocks={'.':{sequelize:db},'../data':{sequelize:db},'../config':{default:config,__esModule:true}},all={};
 for(const name of ['gitCredential','repository','worktree','scopedEnv','subscription','cron','env','dependence','open','system','cronView','cronStats','runningInstance','configAsset','runtime','pythonEnvironment','nodeEnvironment']){const m=load(path.resolve('back/data/'+name+'.ts'),mocks,cache);Object.assign(all,m);mocks['../data/'+name]=m;}
 const module=file=>load(path.resolve(file),mocks,cache),Paths=module('back/services/runtimePaths.ts').default,Provider=module('back/services/pyenvProvider.ts').default,Operations=module('back/services/runtimeOperations.ts').default,Service=module('back/services/pythonEnvironment.ts').default;
 const paths=new Paths(root),operations=new Operations(new Provider(paths),undefined,index),service=new Service(operations);
 let closed=false;return {root,db,paths,operations,service,...all,load:module,close:async()=>{if(closed)return;closed=true;await operations.close();await db.close();}};
}
async function treeDigest(root){const {createHash}=require('node:crypto'),hash=createHash('sha256');async function walk(dir){for(const name of (await fs.readdir(dir)).sort()){const file=path.join(dir,name),stat=await fs.lstat(file);hash.update(path.relative(root,file)+'\0'+stat.mode+'\0');if(stat.isSymbolicLink())hash.update(await fs.readlink(file));else if(stat.isDirectory())await walk(file);else if(stat.isFile())hash.update(await fs.readFile(file));}}await walk(root);return hash.digest('hex');}
module.exports={attach,treeDigest};
