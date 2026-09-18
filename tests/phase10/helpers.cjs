const fs=require('node:fs/promises'),path=require('node:path');
const base=require('../phase5/helpers.cjs');
async function fixture(t){
 let cleanup;const h=await base.fixture({after(fn){cleanup=fn;}});h.config.rootPath=process.cwd();
 h.mocks['../loaders/logger']={default:{info(){},warn(){},error(){},debug(){}},__esModule:true};
 const Paths=h.load('back/services/executionPaths.ts').default;
 const Service=h.load('back/services/executionService.ts').default;
 h.paths=new Paths(h.root);h.execution=new Service(h.paths);h.taskService=new(h.load('back/services/task.ts').default)();
 t.after(async()=>{try{await h.execution.stop();}finally{await cleanup();}});
 return h;
}
async function task(h,code='printf "hello"',settings={},options={}){
 const suffix=String(await h.WorktreeModel.count()+1);
 const repository=await h.RepositoryModel.create({name:'run-'+suffix,remote_url:'https://example.invalid/run-'+suffix,normalized_url:'run-'+suffix,repository_name:'run-'+suffix,provider:'generic',host:'example.invalid',owner:'fixture',storage_state:'READY'});
 const worktree=await h.WorktreeModel.create({repository_id:repository.id,name:'main',ref_type:'branch',ref_name:'main',lifecycle_state:'READY'});
 const root=path.join(await fs.realpath(h.root),'worktrees','repository-'+repository.id,'wt-'+worktree.id);await fs.mkdir(root,{recursive:true});await worktree.update({local_path:root});
 const entry=options.entry??'main.sh';await fs.mkdir(path.dirname(path.join(root,entry)),{recursive:true});await fs.writeFile(path.join(root,entry),code);
 const definition=await h.taskService.save({name:'Task '+suffix,enabled:true,runtime:options.runtime,arguments:options.arguments??[],source:{type:'WORKTREE_ENTRYPOINT',worktree_id:worktree.id,relative_entrypoint:entry,language:options.language??'SHELL',cwd_mode:options.cwd_mode??'WORKTREE_ROOT',cwd_relative_path:null},settings});
 return {definition,repository,worktree,root};
}
async function wait(h,id,timeout=12000){const deadline=Date.now()+timeout;for(;;){await h.execution.tick();const run=await h.execution.get(id);if(!['QUEUED','RESOLVING','RUNNING'].includes(run.status))return run;if(Date.now()>deadline)throw Error('Run timed out: '+JSON.stringify(run));await new Promise(r=>setTimeout(r,25));}}
module.exports={fixture,task,wait};
