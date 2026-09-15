const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ql-core-baseline-'));
try{
 fs.writeFileSync(path.join(dir,'.env'),'JWT_SECRET=core-test-fixture-only\n');
 for(const name of ['shell','sample'])fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
 const files=['test/back','test/front'].flatMap(d=>fs.readdirSync(path.join(root,d)).filter(f=>f.endsWith('.test.cjs')).map(f=>path.join(d,f)));
 const testEnv={...process.env,QL_DIR:dir,TS_NODE_PROJECT:'back/tsconfig.json'};delete testEnv.QL_DATA_DIR;
 const r=spawnSync(process.execPath,['-r','ts-node/register/transpile-only','--test',...files],{cwd:root,env:testEnv,stdio:'inherit'});process.exitCode=r.status||0;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
