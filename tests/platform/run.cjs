// Release gate: only explicitly classified active tests. Legacy evidence never runs here.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'platform-gate-'));
try {
 fs.writeFileSync(path.join(directory,'.env'),'JWT_SECRET=isolated-platform-test-fixture\n',{mode:0o600});
 for(const name of ['shell','sample'])fs.cpSync(path.join(root,name),path.join(directory,name),{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'test-baseline.json'),'utf8'));
 const files=manifest.filter(x=>x.classification!=='ARCHIVED_LEGACY').map(x=>x.path);
 for(const file of files)if(!fs.existsSync(path.join(root,file)))throw new Error(`Missing release gate: ${file}`);
 const env={...process.env,QL_DIR:directory,TS_NODE_PROJECT:path.join(root,'back/tsconfig.json')};delete env.QL_DATA_DIR;
 const result=spawnSync(process.execPath,['-r','ts-node/register/transpile-only','--test',...files],{cwd:root,env,stdio:'inherit'});
 if(result.error)throw result.error;process.exitCode=result.status??1;
} finally { fs.rmSync(directory,{recursive:true,force:true}); }
