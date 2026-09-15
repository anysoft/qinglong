// Build output is wholly owned by the compiler. Remove stale modules from deleted sources.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
fs.rmSync(path.join(root,'static/build'),{recursive:true,force:true});
const result=spawnSync(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'-p',path.join(root,'back/tsconfig.json')],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;process.exitCode=result.status??1;
