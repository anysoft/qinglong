const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const runtime=process.env.QL_BROWSER_RUNTIME||'/tmp/qinglong-phase45b-browser/node_modules';
const {chromium}=require(path.join(runtime,'playwright')), {Server,utils}=require(path.join(runtime,'ssh2'));
const root=path.resolve(__dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'platform-full-'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const evidence={status:'RUNNING',steps:[],linux:process.platform==='linux'};
let backend,browser,ssh,output='',page;const connections=new Set();
const mark=name=>{evidence.steps.push(name);console.log(name);};
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function stop(){if(!backend)return;const cp=backend;backend=null;try{process.kill(-cp.pid,'SIGTERM')}catch{}for(let i=0;i<40&&cp.exitCode===null;i++)await delay(100);try{process.kill(-cp.pid,'SIGKILL')}catch{}}
async function until(fn){const deadline=Date.now()+60000;let last;while(Date.now()<deadline){try{const value=await fn();if(value)return value;}catch(e){last=e;}await delay(200);}throw last||new Error('poll timeout');}
(async()=>{
 fs.chmodSync(tmp,0o700);
 for(const d of ['shell','sample'])fs.cpSync(path.join(root,d),path.join(tmp,d),{recursive:true});
 fs.copyFileSync(path.join(root,'version.yaml'),path.join(tmp,'version.yaml'));
 fs.symlinkSync(path.join(root,'node_modules'),path.join(tmp,'node_modules'));fs.mkdirSync(path.join(tmp,'back'));fs.symlinkSync(path.join(root,'back/protos'),path.join(tmp,'back/protos'));
 fs.mkdirSync(path.join(tmp,'static'));for(const d of ['build','dist'])fs.symlinkSync(path.join(root,'static',d),path.join(tmp,'static',d));
 fs.mkdirSync(path.join(tmp,'home'));fs.mkdirSync(path.join(tmp,'bin'));
 fs.symlinkSync(path.join(tmp,'shell/task.sh'),path.join(tmp,'bin/task'));fs.symlinkSync(path.join(tmp,'shell/update.sh'),path.join(tmp,'bin/ql'));
 fs.writeFileSync(path.join(tmp,'.env'),'JWT_SECRET=local-e2e-only-backend-secret\n');
 const origin=path.join(tmp,'origin');fs.mkdirSync(origin);
 const git=(...args)=>execFileSync('git',args,{cwd:origin,stdio:'pipe'});
 git('init','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
 const scripts={js:'console.log("E2E_NODE:"+process.env.GLOBAL_VALUE+":"+process.env.PROFILE_VALUE+":"+process.env.TASK_VALUE);',py:'import os\nprint("E2E_PYTHON:"+os.environ["GLOBAL_VALUE"]+":"+os.environ["PROFILE_VALUE"]+":"+os.environ["TASK_VALUE"])',sh:'printf "E2E_SHELL:%s:%s:%s\\n" "$GLOBAL_VALUE" "$PROFILE_VALUE" "$TASK_VALUE"'};
 for(const [ext,body]of Object.entries(scripts))fs.writeFileSync(path.join(origin,`job.${ext}`),`${ext==='js'?'//':'#'} name: E2E ${ext}\n${ext==='js'?'//':'#'} cron: 0 0 1 1 *\n${body}\n`);
 git('add','.');git('commit','-qm','fixture');git('branch','secondary');
 for(const name of ['host','client'])execFileSync('ssh-keygen',['-q','-t','ed25519','-N','','-f',path.join(tmp,name)],{stdio:'pipe'});
 const clientKey=utils.parseKey(fs.readFileSync(path.join(tmp,'client.pub'))),hostPublic=fs.readFileSync(path.join(tmp,'host.pub'),'utf8').trim().split(' ').slice(0,2).join(' ');
 ssh=new Server({hostKeys:[fs.readFileSync(path.join(tmp,'host'))]},client=>{
  connections.add(client);client.on('error',()=>{}).on('close',()=>connections.delete(client));
  client.on('authentication',ctx=>{if(ctx.username!=='git'||ctx.method!=='publickey'||!ctx.key.data.equals(clientKey.getPublicSSH())||(ctx.signature&&clientKey.verify(ctx.blob,ctx.signature,ctx.hashAlgo)!==true))return ctx.reject();ctx.accept();});
  client.on('ready',()=>client.on('session',accept=>accept().on('exec',(accept,reject,info)=>{
   if(info.command!=="git-upload-pack '/fixture.git'")return reject();const stream=accept();const cp=spawn('git-upload-pack',[origin],{stdio:['pipe','pipe','pipe']});stream.pipe(cp.stdin);cp.stdout.pipe(stream,{end:false});cp.stderr.pipe(stream.stderr,{end:false});cp.on('close',code=>{stream.exit(code||0);stream.end();});stream.on('close',()=>cp.kill());
  })));
 });
 await new Promise(r=>ssh.listen(0,'127.0.0.1',r));const sshPort=ssh.address().port, http=await port(),grpc=await port(),base=`http://127.0.0.1:${http}`;
 const env={...process.env,QL_DIR:tmp,QL_DATA_DIR:path.join(tmp,'data'),HOME:path.join(tmp,'home'),PATH:path.join(tmp,'bin')+':'+process.env.PATH,JWT_SECRET:'local-e2e-only-backend-secret',BACK_PORT:String(http),GRPC_PORT:String(grpc),BIND_HOST:'127.0.0.1',BIND_HOST_GRPC:'127.0.0.1',QL_SCHEDULER:'node',NODE_ENV:'production'};
 async function start(){backend=spawn(process.execPath,[path.join(root,'static/build/app.js')],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});backend.stdout.on('data',b=>output+=b);backend.stderr.on('data',b=>output+=b);await until(async()=>{const r=await fetch(base+'/api/system');return(await r.json()).code===200;});}
 await start();mark('empty-root-bootstrap');
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1100}});page.setDefaultTimeout(20000);
 await page.goto(base);await page.getByRole('button',{name:'开始安装',exact:true}).click();await page.getByRole('button',{name:'跳过',exact:true}).click();
 await page.getByLabel('用户名',{exact:true}).fill('platform-owner');await page.getByLabel('密码',{exact:true}).fill('e2e-fixture-password');await page.getByLabel('确认密码',{exact:true}).fill('e2e-fixture-password');await page.getByRole('button',{name:/提.*交/}).click();await page.getByRole('button',{name:'去登录',exact:true}).click();
 async function login(){await page.getByLabel('用户名',{exact:true}).fill('platform-owner');await page.getByLabel('密码',{exact:true}).fill('e2e-fixture-password');await page.getByRole('button',{name:/登.*录/}).click();await until(async()=>page.evaluate(()=>!!localStorage.getItem('token')));}
 await login();mark('browser-fresh-initialize-login');
 const api=async(url,method='GET',body)=>page.evaluate(async({url,method,body})=>{const token=localStorage.getItem('token');const r=await fetch('/api'+url,{method,headers:{'content-type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});return r.json();},{url,method,body});
 async function choose(label,text,scope=page){await scope.getByLabel(label,{exact:true}).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').click();await page.locator('.ant-select-dropdown:visible').getByText(text,{exact:true}).click();}
 async function confirm(){await page.locator('.ant-modal:visible').getByRole('button',{name:/确.*定/}).click();await page.locator('.ant-modal:visible').waitFor({state:'hidden'});}
 await page.goto(base+'/repository');await page.getByRole('tab',{name:'Credentials / 凭证'}).click();await page.getByRole('button',{name:'创建凭证'}).click();
 let modal=page.locator('.ant-modal:visible');await modal.getByLabel('名称',{exact:true}).fill('E2E SSH');await choose('认证方式','ssh_key',modal);await modal.getByLabel('SSH Private Key',{exact:true}).fill(fs.readFileSync(path.join(tmp,'client'),'utf8'));await modal.getByLabel('已验证的 known_hosts',{exact:true}).fill(`[127.0.0.1]:${sshPort} ${hostPublic}`);await confirm();mark('browser-credential-create');
 await page.getByRole('tab',{name:'Repositories / 仓库'}).click();await page.getByRole('button',{name:'创建仓库'}).click();modal=page.locator('.ant-modal:visible');await modal.getByLabel('名称',{exact:true}).fill('E2E Repo');await modal.getByLabel('Remote URL',{exact:true}).fill(`ssh://git@127.0.0.1:${sshPort}/fixture.git`);await choose('默认凭证','E2E SSH (ssh_key, enabled)',modal);await confirm();
 const repo=(await api('/repositories')).data[0];assert.ok(repo.id);mark('browser-repository-create');
 await page.goto(base+`/repository-workspace?id=${repo.id}`);
 async function repositoryAction(label,operation){const button=page.getByRole('button',{name:label,exact:true});await until(async()=>await button.isVisible()&&!((await button.getAttribute('class'))||'').includes('loading'));const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(`/repositories/${repo.id}/${operation}`)&&r.request().method()==='POST');await button.click();const body=await(await response).json();assert.equal(body.code,200,JSON.stringify(body));await until(async()=>!((await button.getAttribute('class'))||'').includes('loading'));}
 await repositoryAction('Initialize','initialize');await repositoryAction('Fetch','fetch');mark('browser-initialize-fetch');
 await page.goto(base+'/subscription');await page.getByRole('button',{name:'创建订阅',exact:true}).click();modal=page.locator('.ant-modal:visible');assert.doesNotMatch(await modal.innerText(),/Legacy|Managed|Manual URL|Convert|Pull Type|Pull Option|Credential Override/i);await modal.getByLabel('名称',{exact:true}).fill('E2E Subscription');await modal.getByLabel('Repository',{exact:true}).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').click();await page.locator('.ant-select-dropdown:visible').getByText(/E2E Repo/).click();await modal.getByLabel('Branch',{exact:true}).fill('main');await confirm();
 const sub=(await api('/subscriptions')).data[0];assert.ok(sub.id);mark('browser-subscription-create-branch');
 // Open the existing row editor through its name link.
 await page.getByRole('row').filter({hasText:'E2E Subscription'}).locator('.ant-dropdown-trigger').click();await page.getByText('编辑',{exact:true}).click();await page.getByRole('button',{name:'准备已保存的订阅'}).click();await until(async()=>((await api('/subscriptions')).data[0].worktree_id));await page.locator('.ant-modal:visible').getByRole('button',{name:/取.*消/}).click();
 await page.getByRole('row').filter({hasText:'E2E Subscription'}).getByText('运行',{exact:true}).click();await confirm();await until(async()=>((await api('/subscriptions')).data[0].last_sync_state==='SUCCESS'));mark('browser-prepare-sync-discovery');
 await page.goto(base+`/repository-workspace?id=${repo.id}`);await page.getByRole('tab',{name:/Worktrees/}).click();await page.getByRole('cell',{name:'branch: main',exact:true}).waitFor();mark('browser-worktree-view');
 async function variable(name,value){await page.getByRole('button',{name:'添加变量',exact:true}).last().click();const dialog=page.locator('.ant-modal:visible');await dialog.getByLabel('变量名',{exact:true}).fill(name);await dialog.getByLabel('值（允许空字符串）',{exact:true}).fill(value);await confirm();}
 await page.goto(base+'/env');await variable('GLOBAL_VALUE','global');mark('browser-global-create');
 await page.getByRole('tab',{name:'Repository',exact:true}).click();await choose('Repository','E2E Repo (0 Profiles)');await page.getByRole('button',{name:'创建 Profile'}).click();await page.getByLabel('Profile 名称',{exact:true}).fill('E2E Profile');await confirm();await page.getByRole('button',{name:'设为 Default'}).click();await page.getByRole('button',{name:'变量',exact:true}).click();await variable('PROFILE_VALUE','profile');mark('browser-profile-create-default');
 const tasks=(await api('/crons')).data.data;assert.equal(tasks.length,3);
 for(const task of tasks){await page.goto(base+`/env?task=${task.id}`);await variable('TASK_VALUE','task');await page.getByRole('button',{name:'预览有效环境'}).click();await page.getByRole('columnheader',{name:'有效值',exact:true}).waitFor();if(!await page.getByRole('cell',{name:'GLOBAL_VALUE',exact:true}).isVisible())await page.locator('.ant-pagination-item-2').click();await page.getByRole('cell',{name:'GLOBAL_VALUE',exact:true}).waitFor();}mark('browser-task-overrides-preview');
 for(const task of tasks){await page.goto(base+'/crontab');const row=page.getByRole('row').filter({hasText:task.name});await row.getByText('运行',{exact:true}).click();await confirm();await until(async()=>{const r=await api(`/crons/${task.id}/log`);return JSON.stringify(r).includes('E2E_')&&JSON.stringify(r).includes('global:profile:task');});await row.getByText('日志',{exact:true}).click();await page.locator('.ant-modal:visible').waitFor();await page.locator('.ant-modal:visible .ant-modal-close').click();}mark('browser-three-language-run-logs');
 // Exercise the actual edit toggle and prepare binding after disable/enable.
 for(const disabled of [true,false]){await page.goto(base+'/subscription');await page.getByRole('row').filter({hasText:'E2E Subscription'}).locator('.ant-dropdown-trigger').click();await page.getByText('编辑',{exact:true}).click();await page.getByLabel('禁用',{exact:true}).setChecked(disabled);await confirm();assert.equal((await api('/subscriptions')).data[0].is_disabled,disabled?1:0);}mark('browser-disable-enable');
 await page.screenshot({path:path.join(__dirname,'browser-subscription.png'),fullPage:true});
 await stop();await start();await page.evaluate(()=>localStorage.removeItem('token'));await page.goto(base+'/login');await login();mark('restart-relogin');
 assert.equal((await api('/crons')).data.data.length,3);assert.equal((await api('/subscriptions')).data[0].worktree_id,sub.worktree_id||1);
 const previousLog=JSON.stringify(await api(`/crons/${tasks[0].id}/log`));assert.equal((await api('/crons/run','PUT',[tasks[0].id])).code,200);await until(async()=>{const currentLog=JSON.stringify(await api(`/crons/${tasks[0].id}/log`));return currentLog!==previousLog&&currentLog.includes('global:profile:task');});mark('restart-repeat-execution');
 for(const dir of ['repo','raw'])assert.equal(fs.existsSync(path.join(tmp,'data',dir)),false);
 const {Sequelize,QueryTypes}=require('sequelize');const db=new Sequelize({dialect:'sqlite',storage:path.join(tmp,'data/db/database.sqlite'),logging:false});assert.deepEqual(await db.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);assert.equal((await db.query('SELECT platform_schema_version FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,1);await db.close();
 evidence.status='PASS';mark('fresh-v1-fk-layout');
})().catch(async error=>{evidence.status='FAIL';evidence.error=error.message;console.error(error);if(fs.existsSync(path.join(tmp,'data/log'))){for(const f of fs.readdirSync(path.join(tmp,'data/log'),{recursive:true})){const p=path.join(tmp,'data/log',f);if(fs.statSync(p).isFile()&&!f.includes('subscription-1/'))console.error(f,fs.readFileSync(p,'utf8').slice(-2500));}}if(fs.existsSync(path.join(tmp,'data/log/subscription-1'))){for(const f of fs.readdirSync(path.join(tmp,'data/log/subscription-1')))console.error(fs.readFileSync(path.join(tmp,'data/log/subscription-1',f),'utf8'));}if(page)try{await page.screenshot({path:path.join(__dirname,'browser-failure.png'),fullPage:true});fs.writeFileSync(path.join(__dirname,'browser-failure.txt'),await page.locator('body').innerText());}catch{}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();for(const c of connections)c.end();if(ssh)ssh.close();fs.writeFileSync(path.join(__dirname,'platform-e2e.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(__dirname,'platform-e2e-backend.log'),output);fs.rmSync(tmp,{recursive:true,force:true});});
