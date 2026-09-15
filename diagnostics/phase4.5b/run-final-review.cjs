const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync,spawnSync}=require('node:child_process');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'platform-review-index-'));
try {
 const index=path.resolve(execFileSync('git',['rev-parse','--git-path','index'],{encoding:'utf8'}).trim());
 const copy=path.join(temp,'index');fs.copyFileSync(index,copy);const env={...process.env,GIT_INDEX_FILE:copy};
 const files=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 if(files.length)execFileSync('git',['add','-N','--',...files],{env});
 const r=spawnSync('gitnexus',['detect-changes','--scope','compare','--base-ref','develop','--repo','qinglong','--limit','500'],{env,encoding:'utf8'});
 fs.writeFileSync(path.join(__dirname,'final-review.txt'),r.stdout+r.stderr);process.stdout.write((r.stdout+r.stderr).split('\n').slice(0,9).join('\n')+'\n');process.exitCode=r.status||0;
} finally {fs.rmSync(temp,{recursive:true,force:true});}
