const fs=require('node:fs/promises'),path=require('node:path');
const {fixture}=require('../phase5/helpers.cjs');
async function runtimeFixture(t,{real=false}={}){
 const h=await fixture(t);await fs.cp(path.resolve('shell'),path.join(h.root,'shell'),{recursive:true});
 const Paths=h.load('back/services/runtimePaths.ts').default,Provider=h.load('back/services/pyenvProvider.ts').default;
 const paths=new Paths(h.root);
 class FixtureProvider extends Provider{
  async setup(ctx){await ctx.stage('FETCHING_PROVIDER');await paths.directory('runtime/python/pyenv/providers/'+this.revision+'/.git',true);return {revision:this.revision,release:this.release};}
  async verifyProvider(){return 'pyenv fixture';}
  async catalog(){return ['3.13.12','3.12.12'];}
  async install(ctx,runtime){const root=await paths.createInstallation(runtime.version,runtime.id,ctx.providerId);await fs.mkdir(path.join(root,'bin'));
   const metadata={executable:path.join(root,'bin/python'),version:runtime.version.split('.').map(Number),prefix:root,base_prefix:root,implementation:'CPython',machine:process.arch,system:process.platform,version_text:runtime.version};
   await fs.writeFile(path.join(root,'bin/python'),'#!/bin/sh\nprintf \'%s\\n\' '+"'"+JSON.stringify(metadata)+"'"+'\n',{mode:0o700});await ctx.stage('BUILDING');await ctx.command.run('/bin/sh',['-c','echo fixture-build; sleep 0.15'],ctx.directory,ctx.environment);return this.verify(ctx,runtime,true);
  }
 }
 const provider=real?new Provider(paths):new FixtureProvider(paths);
 const Service=h.load('back/services/runtimeOperations.ts').default,service=new Service(provider);
 t.after(()=>service.close());
 const run=async(type,input)=>{const op=await service.request(type,input);return service.wait(op.id);};
 return {...h,paths,provider,service,run};
}
module.exports={runtimeFixture};
