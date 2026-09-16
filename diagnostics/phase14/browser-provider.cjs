// Reuse verified official distributions; all HTTP, DB, dependency builds and UI are real.
require('../../tests/phase6/browser-provider.cjs');
const fs=require('node:fs/promises'),path=require('node:path');
const Python=require('../../static/build/services/pyenvProvider').default;
Python.prototype.catalog=async()=>['3.13.15'];
Python.prototype.install=async function(ctx,runtime){const manifest=require('./managed-runtime/result.json');if(manifest.status!=='PASS'||runtime.version!=='3.13.15')throw Error('Official CPython artifact required');const target=await this.paths.createInstallation(runtime.version,runtime.id,ctx.providerId);await fs.cp(path.join(manifest.root,'runtime/python/pyenv/versions',runtime.version),target,{recursive:true,verbatimSymlinks:true});return this.verify(ctx,runtime,true);};
const manifest=require('./managed-node/result.json');if(manifest.status!=='PASS')throw Error('Official Node artifact required');
const Node=require('../../static/build/services/nodeDistributionProvider').default;
Node.prototype.catalog=async()=>[{version:manifest.runtime.version,date:'2026-09-01',lts:'Krypton',files:['osx-arm64-tar','linux-x64'],npm:manifest.runtime.metadata.npm_version}];
Node.prototype.install=async function(ctx,runtime){const target=await this.paths.create('runtime',runtime.id);await fs.cp(path.join(manifest.root,'runtime/node/versions/runtime-'+manifest.runtime.id),target,{recursive:true,verbatimSymlinks:true});return this.verify(ctx,runtime);};
const modulePath=require.resolve('../../static/build/services/runtimeOperations'),Base=require(modulePath).default;
require.cache[modulePath].exports.default=class BrowserOperations extends Base{constructor(provider,references){super(provider,references,process.env.QL_PHASE7_TEST_INDEX,{registry:process.env.QL_PHASE8_TEST_REGISTRY});}};
