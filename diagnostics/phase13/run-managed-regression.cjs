const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const artifacts=['diagnostics/phase7/offline-result.json','diagnostics/phase8/offline-result.json','diagnostics/phase8/lifecycle-result.json'];
const previous=new Map(artifacts.map(file=>[file,fs.existsSync(file)?fs.readFileSync(file):null]));
try{
 const run=spawnSync(process.execPath,['--require',path.resolve(__dirname,'use-runtime-fixtures.cjs'),'--test','--test-concurrency=1','tests/phase7/offline.test.cjs','tests/phase8/offline.test.cjs','tests/phase8/lifecycle.test.cjs'],{stdio:'inherit'});
 for(const file of artifacts)if(fs.existsSync(file))fs.copyFileSync(file,path.join(__dirname,path.basename(path.dirname(file))+'-'+path.basename(file)));
 process.exitCode=run.status??1;
}finally{for(const [file,value] of previous)if(value)fs.writeFileSync(file,value);else fs.rmSync(file,{force:true});}
