const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
async function registry(){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'phase8-registry-')),packages=new Map(),artifacts=new Map(),requests=[];let origin;
 async function add(name,version,extra={},files={}){
  const pkg={name,version,main:'index.js',...extra},contents={'package.json':JSON.stringify(pkg),'index.js':`module.exports=${JSON.stringify(name+'@'+version)};\n`,...files};
  const file=path.join(root,crypto.createHash('sha256').update(name+version).digest('hex')+'.tgz');
  execFileSync('/usr/bin/python3',['-I','-S','-c',`import io,json,tarfile,sys\nfiles=json.loads(sys.argv[2])\nwith tarfile.open(sys.argv[1],'w:gz') as t:\n for name,text in sorted(files.items()):\n  data=text.encode();info=tarfile.TarInfo('package/'+name);info.size=len(data);info.mode=0o644;info.mtime=0;t.addfile(info,io.BytesIO(data))`,file,JSON.stringify(contents)]);
  const bytes=await fs.readFile(file),key=path.basename(file);artifacts.set(key,bytes);const rows=packages.get(name)??new Map();rows.set(version,{...pkg,dist:{tarball:()=>origin+'/artifacts/'+key,shasum:crypto.createHash('sha1').update(bytes).digest('hex'),integrity:'sha512-'+crypto.createHash('sha512').update(bytes).digest('base64')}});packages.set(name,rows);
 }
 const server=http.createServer((req,res)=>{requests.push(req.url);const url=new URL(req.url,'http://127.0.0.1');if(url.pathname.startsWith('/artifacts/')){const bytes=artifacts.get(url.pathname.split('/').pop());if(bytes){res.setHeader('Content-Type','application/octet-stream');res.end(bytes);return;}}
  const name=decodeURIComponent(url.pathname.slice(1)).replace(/\/$/,'');const rows=packages.get(name);if(!rows){res.statusCode=404;res.end(JSON.stringify({error:'not found'}));return;}const versions={};for(const [version,pkg] of rows)versions[version]={...pkg,dist:{...pkg.dist,tarball:pkg.dist.tarball()}};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({name,'dist-tags':{latest:[...rows.keys()].at(-1)},versions}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 await add('ql-phase8-leaf','1.0.0');await add('ql-phase8-extra','1.0.0');await add('ql-phase8-foo','1.0.0',{dependencies:{'ql-phase8-leaf':'^1.0.0'}});await add('ql-phase8-foo','2.0.0',{dependencies:{'ql-phase8-leaf':'^1.0.0','ql-phase8-extra':'1.0.0'}});await add('@phase8/scoped','1.0.0');
 await add('ql-phase8-script','1.0.0',{scripts:{postinstall:'node install.js'}},{'install.js':`const fs=require('fs');fs.writeFileSync('postinstall-marker',JSON.stringify({executable:process.execPath,secret:process.env.PHASE8_BACKEND_SECRET??null,node_options:process.env.NODE_OPTIONS??null,proxy:process.env.HTTP_PROXY??null}));console.log('PHASE8_POSTINSTALL_EXECUTED');`});
 await add('ql-phase8-broken','1.0.0',{scripts:{postinstall:'node install.js'}},{'install.js':`console.error('PHASE8_NATIVE_BUILD_FAILURE node-gyp compiler fixture');process.exit(7);`});
 await add('ql-phase8-slow','1.0.0',{scripts:{postinstall:'node install.js'}},{'install.js':`const {spawn}=require('child_process');const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'inherit'});console.log('PHASE8_CHILD_PID='+child.pid+' PHASE8_SLOW_READY '+'.'.repeat(4096));setInterval(()=>{},1000);`});
 await add('pnpm','10.99.1',{engines:{node:'>=99.0.0'}});
 return {url:origin+'/',root,requests,add,close:async()=>{server.closeAllConnections?.();await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}};
}
module.exports={registry};
