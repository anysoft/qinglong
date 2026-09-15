// Browser-only prebuilt fixture: actual CPython produced by prepare-managed-runtime.cjs, never a host Python stand-in.
require('../phase6/browser-provider.cjs');
const fs=require('node:fs/promises'),path=require('node:path');
const Provider=require('../../static/build/services/pyenvProvider').default,install=Provider.prototype.install;
Provider.prototype.catalog=async()=>['3.13.15','3.13.12','3.12.12'];
Provider.prototype.install=async function(ctx,runtime){
 if(runtime.version!=='3.13.15')return install.call(this,ctx,runtime);
 const manifest=require('../../diagnostics/phase7/managed-runtime/result.json');if(manifest.status!=='PASS'||manifest.fixture_provider!==false)throw Error('Managed source fixture required');
 const target=await this.paths.createInstallation(runtime.version,runtime.id,ctx.providerId),source=path.join(manifest.root,'runtime/python/pyenv/versions',runtime.version);
 await ctx.stage('MATERIALIZING_PREBUILT_TEST_RUNTIME');
 await fs.cp(source,target,{recursive:true,dereference:false,verbatimSymlinks:true});
 return this.verify(ctx,runtime,true);
};
const modulePath=require.resolve('../../static/build/services/runtimeOperations'),Base=require(modulePath).default;
require.cache[modulePath].exports.default=class BrowserOperations extends Base{constructor(provider,references){super(provider,references,process.env.QL_PHASE7_TEST_INDEX);}};
