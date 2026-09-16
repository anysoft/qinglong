// Explicit Node --require fixture used only by browser acceptance. Production has no fixture switch.
const fs=require('node:fs/promises'),path=require('node:path');
const Provider=require('../../static/build/services/pyenvProvider').default;
Provider.prototype.setup=async function(ctx){await ctx.stage('FETCHING_PROVIDER');await this.paths.directory('runtime/python/pyenv/providers/'+this.revision+'/.git',true);return {revision:this.revision,release:this.release};};
Provider.prototype.verifyProvider=async()=> 'pyenv browser fixture';
Provider.prototype.catalog=async()=> ['3.13.12','3.12.12'];
Provider.prototype.install=async function(ctx,runtime){
 const root=await this.paths.createInstallation(runtime.version,runtime.id,ctx.providerId);await fs.mkdir(path.join(root,'bin'));
 const metadata={executable:path.join(root,'bin/python'),version:runtime.version.split('.').map(Number),prefix:root,base_prefix:root,implementation:'CPython',machine:process.arch,system:process.platform,version_text:runtime.version};
 await fs.writeFile(path.join(root,'bin/python'),'#!/bin/sh\nprintf \'%s\\n\' '+"'"+JSON.stringify(metadata)+"'"+'\n',{mode:0o700});
 await ctx.stage('BUILDING');await ctx.command.run('/bin/sh',['-c','echo browser-fixture-build; sleep '+(runtime.version==='3.13.12'?'20':'1')],ctx.directory,ctx.environment);
 return this.verify(ctx,runtime,true);
};
