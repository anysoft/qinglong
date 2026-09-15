// Isolated configuration for the existing suite. No application server is started.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ql-phase0-suite-'));
try {
  fs.writeFileSync(path.join(dir,'.env'),'JWT_SECRET=phase0-test-only-not-a-production-secret\n');
  for(const name of ['db','config','log','syslog','scripts','repo','dep_cache','ssh.d','upload']) fs.mkdirSync(path.join(dir,'data',name),{recursive:true});
  for(const name of ['shell','sample']) fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
  const suite=process.argv[2]||'existing';
  const result=spawnSync(suite==='existing'?'npm':process.execPath,
    suite==='existing'?['test']:['--test',...fs.readdirSync(path.join(root,'tests/phase0')).filter(x=>x.endsWith('.test.cjs')).map(x=>path.join(root,'tests/phase0',x))],
    {cwd:root,env:{...process.env,QL_DIR:dir,QL_DATA_DIR:'',QL_SCHEDULER:'node'},stdio:'inherit',timeout:180000});
  if(result.error) console.error(result.error);
  process.exitCode=result.status??1;
} finally {fs.rmSync(dir,{recursive:true,force:true});}
