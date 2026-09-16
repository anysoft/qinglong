const fs=require('node:fs/promises'),path=require('node:path'),{Sequelize}=require('sequelize');
const load=require('../../test/helpers/load-security-module.cjs');
(async()=>{
 const root=process.argv[2],db=new Sequelize({dialect:'sqlite',storage:path.join(root,'database.sqlite'),logging:false}),cache=new Map();
 const mocks={'.':{sequelize:db},'../data':{sequelize:db},'../config':{default:{rootPath:root,dataPath:root},__esModule:true}};
 const Paths=load(path.resolve('back/services/runtimePaths.ts'),mocks,cache).default;
 const {RuntimeLease,RuntimeCommand}=load(path.resolve('back/services/runtimeProcess.ts'),mocks,cache);
 const paths=new Paths(root),lease=await RuntimeLease.acquire(paths,1),directory=await paths.operation(777);
 const build=await load(path.resolve('back/services/runtimeBuildEnvironment.ts'),mocks,cache).default(paths,777,1);
 const command=new RuntimeCommand(lease,60,async()=>{});
 process.send({ready:true});
 await command.run('/bin/sh',['-c','sleep 60 & echo $! > descendant.pid; wait'],directory,build.environment);
 await lease.release();await db.close();process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
