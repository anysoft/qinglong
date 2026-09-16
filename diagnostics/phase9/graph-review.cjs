// Invoke the same GitNexus local backend as CLI, preserving full structured output.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
(async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phase6-review-'));
 const saved=process.env.GIT_INDEX_FILE;let backend;
 try{
  const index=path.resolve(execFileSync('git',['rev-parse','--git-path','index'],{encoding:'utf8'}).trim());process.env.GIT_INDEX_FILE=path.join(directory,'index');fs.copyFileSync(index,process.env.GIT_INDEX_FILE);
  const files=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);if(files.length)execFileSync('git',['add','-N','--',...files]);
  const {LocalBackend}=await import(pathToFileURL(process.argv[2]).href);backend=new LocalBackend();if(!await backend.init())throw Error('No index');
  for(const base of ['HEAD','develop']){const report=await backend.callTool('detect_changes',{scope:'compare',base_ref:base,repo:'qinglong'});fs.writeFileSync(path.join(__dirname,'graph-review-'+base+'.json'),JSON.stringify(report,null,2)+'\n');fs.writeSync(1,JSON.stringify({base,changed:report.changed_count,flows:report.affected_processes?.length,risk:report.risk_level,partial:report.partial,truncated:report.truncated})+'\n');}
 }finally{if(saved===undefined)delete process.env.GIT_INDEX_FILE;else process.env.GIT_INDEX_FILE=saved;fs.rmSync(directory,{recursive:true,force:true});await backend?.cleanup?.();}
})().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
