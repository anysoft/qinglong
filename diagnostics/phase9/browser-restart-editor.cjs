// Supplemental real backend restart and editor persistence gate; no runtime installation needed.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const runtime=process.env.QL_BROWSER_RUNTIME||'/tmp/qinglong-phase45b-browser/node_modules';
const {chromium}=require(path.join(runtime,'playwright')), {Server,utils}=require(path.join(runtime,'ssh2'));
const root=path.resolve(__dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'platform-full-'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const evidence={status:'RUNNING',steps:[],linux:process.platform==='linux'};
let backend,browser,ssh,packageIndex,nodeRegistry,output='',page;const connections=new Set();
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
 const scripts={
 js:'const fs=require("fs"); console.log("E2E_NODE:"+process.env.GLOBAL_VALUE+":"+process.env.PROFILE_VALUE+":"+process.env.TASK_VALUE); console.log("CONFIG_OK:"+fs.readFileSync("config.txt","utf8")); if(fs.existsSync("secret.txt"))console.log(fs.readFileSync("secret.txt","utf8")); console.log(process.env.HOOK_TOKEN);',
 py:'import os\nprint("E2E_PYTHON:"+os.environ["GLOBAL_VALUE"]+":"+os.environ["PROFILE_VALUE"]+":"+os.environ["TASK_VALUE"])\nprint("CONFIG_OK:"+open("config.txt").read())\nif os.path.exists("secret.txt"): print(open("secret.txt").read())\nprint(os.environ["HOOK_TOKEN"])',
 sh:'printf "E2E_SHELL:%s:%s:%s\\n" "$GLOBAL_VALUE" "$PROFILE_VALUE" "$TASK_VALUE"; printf "CONFIG_OK:"; cat config.txt; [ ! -f secret.txt ] || cat secret.txt; printf "\\n%s\\n" "$HOOK_TOKEN"'};

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
 async function start(){backend=spawn(process.execPath,['--require',path.join(__dirname,'browser-provider.cjs'),path.join(root,'static/build/app.js')],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});backend.stdout.on('data',b=>output+=b);backend.stderr.on('data',b=>output+=b);await until(async()=>{const r=await fetch(base+'/api/system');return(await r.json()).code===200;});}
 packageIndex=await require('../../tests/phase7/wheelhouse.cjs').wheelhouse(path.join(tmp,'wheelhouse'));env.QL_PHASE7_TEST_INDEX=packageIndex.index;
 nodeRegistry=await require('../../tests/phase8/registry.cjs').registry();env.QL_PHASE8_TEST_REGISTRY=nodeRegistry.url;
 await start();mark('empty-root-bootstrap');
 browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{channel:'chrome'}:{})});page=await browser.newPage({locale:'zh-CN',viewport:{width:1440,height:1100}});page.setDefaultTimeout(20000);
 const forbidden=['local-e2e-only-backend-secret','CONFIG_SECRET_E2E','generated-private-e2e','ENV_SECRET_E2E'];const leaks=[];const inspected=[];let websocketFrames=0;page.on('websocket',socket=>socket.on('framereceived',event=>{websocketFrames++;if(forbidden.some(value=>String(event.payload).includes(value)))leaks.push('websocket:'+new URL(socket.url()).pathname);}));page.on('response',async response=>{if(!response.url().includes('/api/'))return;try{const body=await response.text();inspected.push(response.url());if(forbidden.some(value=>body.includes(value)))leaks.push(new URL(response.url()).pathname);}catch{}});
 await page.goto(base);await page.getByRole('button',{name:'开始安装',exact:true}).click();await page.getByRole('button',{name:'跳过',exact:true}).click();
 await page.getByLabel('用户名',{exact:true}).fill('platform-owner');await page.getByLabel('密码',{exact:true}).fill('e2e-fixture-password');await page.getByLabel('确认密码',{exact:true}).fill('e2e-fixture-password');await page.getByRole('button',{name:/提.*交/}).click();await page.getByRole('button',{name:'去登录',exact:true}).click();
 async function login(){await page.getByLabel('用户名',{exact:true}).fill('platform-owner');await page.getByLabel('密码',{exact:true}).fill('e2e-fixture-password');await page.getByRole('button',{name:/登.*录/}).click();await until(async()=>page.evaluate(()=>!!localStorage.getItem('token')));}
 await login();mark('browser-fresh-initialize-login');
 const api=async(url,method='GET',body)=>page.evaluate(async({url,method,body})=>{const token=localStorage.getItem('token');const r=await fetch('/api'+url,{method,headers:{'content-type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});return r.json();},{url,method,body});
 async function choose(label,text,scope=page){await scope.getByLabel(label,{exact:true}).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(text,{exact:true}).click();}
 async function confirm(){await page.locator('.ant-modal:visible').getByRole('button',{name:/确.*定/}).click();await page.locator('.ant-modal:visible').waitFor({state:'hidden'});}
 await page.goto(base+'/repository');await page.getByRole('tab',{name:'Credentials / 凭证'}).click();await page.getByRole('button',{name:'创建凭证'}).click();
 let modal=page.locator('.ant-modal:visible');await modal.getByLabel('名称',{exact:true}).fill('E2E SSH');await choose('认证方式','ssh_key',modal);await modal.getByLabel('SSH Private Key',{exact:true}).fill(fs.readFileSync(path.join(tmp,'client'),'utf8'));await modal.getByLabel('已验证的 known_hosts',{exact:true}).fill(`[127.0.0.1]:${sshPort} ${hostPublic}`);await confirm();mark('browser-credential-create');
 await page.getByRole('tab',{name:'Repositories / 仓库'}).click();await page.getByRole('button',{name:'创建仓库'}).click();modal=page.locator('.ant-modal:visible');await modal.getByLabel('名称',{exact:true}).fill('E2E Repo');await modal.getByLabel('Remote URL',{exact:true}).fill(`ssh://git@127.0.0.1:${sshPort}/fixture.git`);await choose('默认凭证','E2E SSH (ssh_key, enabled)',modal);await confirm();
 const repo=(await api('/repositories')).data[0];assert.ok(repo.id);mark('browser-repository-create');
 await page.goto(base+`/repository-workspace?id=${repo.id}`);
 async function repositoryAction(label,operation){
  const button=page.getByRole('button',{name:label,exact:true});let body;
  // A read-only diagnostics lease may overlap a UI click; only explicit BUSY is retryable.
  for(let attempt=0;attempt<5;attempt++){
   await until(async()=>await button.isVisible()&&!((await button.getAttribute('class'))||'').includes('loading'));
   const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith(`/repositories/${repo.id}/${operation}`)&&r.request().method()==='POST');
   await button.click();body=await(await response).json();
   if(body.code!==409||body.error_code!=='REPOSITORY_BUSY')break;
   await delay(300);
  }
  assert.equal(body.code,200,JSON.stringify(body));await until(async()=>!((await button.getAttribute('class'))||'').includes('loading'));
 }

 await repositoryAction('Initialize','initialize');await repositoryAction('Fetch','fetch');mark('browser-initialize-fetch');
 await page.goto(base+'/subscription');await page.getByRole('button',{name:'创建订阅',exact:true}).click();modal=page.locator('.ant-modal:visible');assert.doesNotMatch(await modal.innerText(),/Legacy|Managed|Manual URL|Convert|Pull Type|Pull Option|Credential Override/i);await modal.getByLabel('名称',{exact:true}).fill('E2E Subscription');await modal.getByLabel('Repository',{exact:true}).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').click();await page.locator('.ant-select-dropdown:visible').getByText(/E2E Repo/).click();await modal.getByLabel('Branch',{exact:true}).fill('main');await confirm();
 const sub=(await api('/subscriptions')).data[0];await page.goto(base+'/subscription');assert.ok(sub.id);mark('browser-subscription-create-branch');
 // Open the existing row editor through its name link.
 await page.getByRole('row').filter({hasText:'E2E Subscription'}).locator('.ant-dropdown-trigger').click();await page.getByText('编辑',{exact:true}).click();await page.getByRole('button',{name:'准备已保存的订阅'}).click();await until(async()=>((await api('/subscriptions')).data[0].worktree_id));await page.locator('.ant-modal:visible').getByRole('button',{name:/取.*消/}).click();
 await page.getByRole('row').filter({hasText:'E2E Subscription'}).getByText('运行',{exact:true}).click();await confirm();await until(async()=>((await api('/subscriptions')).data[0].last_sync_state==='SUCCESS'));mark('browser-prepare-sync-discovery');
 await page.goto(base+`/repository-workspace?id=${repo.id}`);await page.getByRole('tab',{name:/Worktrees/}).click();await page.getByRole('cell',{name:'branch: main',exact:true}).waitFor();mark('browser-worktree-view');
 async function variable(name,value,secret=false){await page.getByRole('button',{name:'添加变量',exact:true}).last().click();const dialog=page.locator('.ant-modal:visible');await dialog.getByLabel('变量名',{exact:true}).fill(name);if(secret)await dialog.getByLabel('Secret',{exact:true}).setChecked(true);await dialog.getByLabel(secret?'新 Secret 值':'值（允许空字符串）',{exact:true}).fill(value);await confirm();}
 await page.goto(base+'/env');await variable('GLOBAL_VALUE','global');await variable('SECRET_ENV','ENV_SECRET_E2E',true);mark('browser-global-create');
 await page.getByRole('tab',{name:'Repository',exact:true}).click();console.log('ENV_REPOSITORIES',JSON.stringify(await api('/scoped-env/repositories')));await choose('Repository','E2E Repo (0 Profiles)');await page.getByRole('button',{name:'创建 Profile'}).click();await page.getByLabel('Profile 名称',{exact:true}).fill('E2E Profile');await confirm();await page.getByRole('button',{name:'设为 Default'}).click();await page.getByRole('button',{name:'变量',exact:true}).click();await variable('PROFILE_VALUE','profile');mark('browser-profile-create-default');

 await page.goto(base+'/tasks');await page.getByRole('button',{name:'Create Task',exact:true}).click();const taskDialog=()=>page.getByRole('dialog',{name:/^(Create Task|Task:)/});
 await taskDialog().getByLabel('Name',{exact:true}).fill('Restart editor Task');await taskDialog().getByLabel('Arguments — JSON array',{exact:true}).fill('["--literal","$TOKEN"]');await taskDialog().getByRole('tab',{name:'Source',exact:true}).click();await taskDialog().getByLabel('Worktree',{exact:true}).locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').click();await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').first().click();await choose('Entrypoint','job.sh',taskDialog());
 await taskDialog().getByRole('tab',{name:'Execution Settings',exact:true}).click();await taskDialog().getByLabel('Maximum attempts',{exact:true}).fill('4');await taskDialog().getByLabel('Timeout seconds (empty = platform default)',{exact:true}).fill('90');await choose('Concurrency','QUEUE',taskDialog());await choose('Notification','FAILURE',taskDialog());
 const saving=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/tasks'&&r.request().method()==='POST');await taskDialog().getByRole('button',{name:'Save Task',exact:true}).click();const saved=await(await saving).json();assert.equal(saved.code,200,JSON.stringify(saved));const task=saved.data;await taskDialog().getByRole('button',{name:'Close',exact:true}).last().click();mark('browser-save-structured-definition-before-restart');
 await stop();await start();await page.evaluate(()=>localStorage.removeItem('token'));await page.goto(base+'/login');await login();await page.goto(base+'/tasks');await page.getByRole('button',{name:task.name,exact:true}).click();await taskDialog().waitFor();assert.equal(await taskDialog().getByLabel('Name',{exact:true}).inputValue(),task.name);assert.deepEqual(JSON.parse(await taskDialog().getByLabel('Arguments — JSON array',{exact:true}).inputValue()),['--literal','$TOKEN']);await taskDialog().getByRole('tab',{name:'Source',exact:true}).click();assert.equal(await taskDialog().getByLabel('Language',{exact:true}).inputValue(),'SHELL');await taskDialog().getByRole('tab',{name:'Execution Settings',exact:true}).click();assert.equal(await taskDialog().getByLabel('Maximum attempts',{exact:true}).inputValue(),'4');assert.equal(await taskDialog().getByLabel('Timeout seconds (empty = platform default)',{exact:true}).inputValue(),'90');await taskDialog().getByText('QUEUE',{exact:true}).waitFor();await taskDialog().getByText('FAILURE',{exact:true}).waitFor();await page.screenshot({path:path.join(__dirname,'browser-restart-editor.png'),fullPage:true});mark('browser-restart-reopen-task-editor-fields-persisted');
 assert.deepEqual(leaks,[]);evidence.status='PASS';evidence.response_payloads_inspected=inspected.length;evidence.websocket_frames_inspected=websocketFrames;
})().catch(async error=>{evidence.status='FAIL';evidence.error=error.stack;console.error(error);if(page)try{await page.screenshot({path:path.join(__dirname,'browser-restart-failure.png'),fullPage:true});fs.writeFileSync(path.join(__dirname,'browser-restart-failure.txt'),await page.locator('body').innerText());}catch{}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();if(packageIndex)await packageIndex.close();if(nodeRegistry)await nodeRegistry.close();for(const c of connections)c.end();if(ssh)ssh.close();fs.writeFileSync(path.join(__dirname,'browser-restart-editor.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(__dirname,'browser-restart-editor-backend.log'),output);fs.rmSync(tmp,{recursive:true,force:true});});
