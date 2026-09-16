const fs=require('node:fs/promises'),path=require('node:path');
const {fixture}=require('../../tests/phase5/helpers.cjs');
(async()=>{
 let cleanup;const h=await fixture({after(f){cleanup=f;}});h.config.rootPath=process.cwd();
 const Provider=h.load('back/services/pyenvProvider.ts').default,Paths=h.load('back/services/runtimePaths.ts').default,Operations=h.load('back/services/runtimeOperations.ts').default;
 const operations=new Operations(new Provider(new Paths(h.root)));
 const result={root:h.root,source:'official Node.js distribution',started_at:new Date().toISOString(),operations:[]};
 async function run(type,input={}){const op=await operations.request(type,{node:input,timeout_seconds:600});const done=await operations.wait(op.id);result.operations.push(done);await fs.copyFile(await operations.paths.log(op.id),path.join(__dirname,'managed-node','operation-'+op.id+'.log'));console.log(type,done.status,done.error_code??'');if(done.status!=='SUCCESS')throw Error(done.error_code);return done;}
 await fs.mkdir(path.join(__dirname,'managed-node'),{recursive:true});
 try{await run('NODE_CATALOG_REFRESH');const entries=(await operations.node.getProvider()).catalog;const selected=entries.find(x=>x.lts&&x.version.startsWith('24.'));if(!selected)throw Error('No LTS');await run('NODE_RUNTIME_INSTALL',{version:selected.version});const runtime=(await operations.node.runtimes())[0];result.runtime=runtime;await run('NODE_RUNTIME_VERIFY',{runtime_id:runtime.id});await run('NODE_PACKAGE_MANAGER_INSTALL',{runtime_id:runtime.id,manager_type:'NPM'});await run('NODE_PACKAGE_MANAGER_INSTALL',{runtime_id:runtime.id,manager_type:'PNPM',version:'10.17.1'});result.toolchains=await operations.node.toolchains();result.status='PASS';}catch(e){result.status='FAILED';result.error=String(e);process.exitCode=1;}finally{result.finished_at=new Date().toISOString();await fs.writeFile(path.join(__dirname,'managed-node/result.json'),JSON.stringify(result,null,2)+'\n');await operations.close();await h.db.close();console.log('Retained owned fixture:',h.root);}
})().catch(e=>{console.error(e);process.exitCode=1});
