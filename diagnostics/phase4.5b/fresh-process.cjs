const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'platform-fresh-process-'));
let child,output='';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function stop(){if(!child)return;const cp=child;child=null;try{process.kill(-cp.pid,'SIGTERM')}catch{};for(let i=0;i<50&&cp.exitCode===null;i++)await delay(100);try{process.kill(-cp.pid,'SIGKILL')}catch{}}
(async()=>{
 for(const dir of ['shell','sample'])fs.cpSync(path.join(root,dir),path.join(tmp,dir),{recursive:true});
 fs.copyFileSync(path.join(root,'version.yaml'),path.join(tmp,'version.yaml'));
 fs.mkdirSync(path.join(tmp,'static'));fs.symlinkSync(path.join(root,'static/build'),path.join(tmp,'static/build'));
 fs.mkdirSync(path.join(tmp,'home'));fs.writeFileSync(path.join(tmp,'.env'),'JWT_SECRET=fresh-process-fixture-not-production\n');
 const http=await port(),grpc=await port();
 const env={...process.env,QL_DIR:tmp,QL_DATA_DIR:path.join(tmp,'data'),HOME:path.join(tmp,'home'),JWT_SECRET:'fresh-process-fixture-not-production',BACK_PORT:String(http),GRPC_PORT:String(grpc),BIND_HOST:'127.0.0.1',BIND_HOST_GRPC:'127.0.0.1',QL_SCHEDULER:'node',NODE_ENV:'production'};
 async function start(){child=spawn(process.execPath,[path.join(root,'static/build/app.js')],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);for(let i=0;i<200;i++){try{const r=await fetch(`http://127.0.0.1:${http}/api/system`);const body=await r.json();if(body.code===200)return body;}catch{}if(child.exitCode!==null)throw new Error('backend exited');await delay(100);}throw new Error('backend readiness timeout');}
 const initial=await start();assert.equal(initial.data.isInitialized,false);
 const request=async(url,method,body)=>{const r=await fetch(`http://127.0.0.1:${http}/api${url}`,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json()};
 const account={username:'platform-owner',password:'fresh-process-fixture-password'};
 assert.equal((await request('/user/init','PUT',account)).code,200);
 assert.equal((await request('/user/login','POST',account)).code,200);
 await stop();const restarted=await start();assert.equal(restarted.data.isInitialized,true);
 assert.equal((await request('/user/login','POST',account)).code,200);
 assert.equal((await request('/user/init','PUT',account)).code,450);
 const {Sequelize,QueryTypes}=require('sequelize');const db=new Sequelize({dialect:'sqlite',storage:path.join(tmp,'data/db/database.sqlite'),logging:false});
 assert.equal((await db.query('SELECT platform_schema_version FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,1);
 assert.deepEqual(await db.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);await db.close();
 for(const dir of ['repo','raw'])assert.equal(fs.existsSync(path.join(tmp,'data',dir)),false);
 fs.writeFileSync(path.join(__dirname,'step1-process.json'),JSON.stringify({status:'PASS',empty_data_root:true,real_backend:true,real_grpc:true,fresh_admin:true,login:true,restart:true,foreign_keys:true,linux:false},null,2)+'\n');
})().catch(error=>{fs.writeFileSync(path.join(__dirname,'step1-process.json'),JSON.stringify({status:'FAIL',error:error.message},null,2)+'\n');process.exitCode=1}).finally(async()=>{await stop();fs.writeFileSync(path.join(__dirname,'step1-process.log'),output);fs.rmSync(tmp,{recursive:true,force:true});});
