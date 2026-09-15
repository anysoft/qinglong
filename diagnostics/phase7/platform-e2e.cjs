const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const runtime=process.env.QL_BROWSER_RUNTIME||'/tmp/qinglong-phase45b-browser/node_modules';
const {chromium}=require(path.join(runtime,'playwright')), {Server,utils}=require(path.join(runtime,'ssh2'));
const root=path.resolve(__dirname,'../..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'platform-full-'));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const evidence={status:'RUNNING',steps:[],linux:process.platform==='linux'};
let backend,browser,ssh,packageIndex,output='',page;const connections=new Set();
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
 async function start(){backend=spawn(process.execPath,['--require',path.join(root,'tests/phase7/browser-provider.cjs'),path.join(root,'static/build/app.js')],{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});backend.stdout.on('data',b=>output+=b);backend.stderr.on('data',b=>output+=b);await until(async()=>{const r=await fetch(base+'/api/system');return(await r.json()).code===200;});}
 packageIndex=await require('../../tests/phase7/wheelhouse.cjs').wheelhouse(path.join(tmp,'wheelhouse'));env.QL_PHASE7_TEST_INDEX=packageIndex.index;
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
 const sub=(await api('/subscriptions')).data[0];assert.ok(sub.id);mark('browser-subscription-create-branch');
 // Open the existing row editor through its name link.
 await page.getByRole('row').filter({hasText:'E2E Subscription'}).locator('.ant-dropdown-trigger').click();await page.getByText('编辑',{exact:true}).click();await page.getByRole('button',{name:'准备已保存的订阅'}).click();await until(async()=>((await api('/subscriptions')).data[0].worktree_id));await page.locator('.ant-modal:visible').getByRole('button',{name:/取.*消/}).click();
 await page.getByRole('row').filter({hasText:'E2E Subscription'}).getByText('运行',{exact:true}).click();await confirm();await until(async()=>((await api('/subscriptions')).data[0].last_sync_state==='SUCCESS'));mark('browser-prepare-sync-discovery');
 await page.goto(base+`/repository-workspace?id=${repo.id}`);await page.getByRole('tab',{name:/Worktrees/}).click();await page.getByRole('cell',{name:'branch: main',exact:true}).waitFor();mark('browser-worktree-view');
 async function variable(name,value,secret=false){await page.getByRole('button',{name:'添加变量',exact:true}).last().click();const dialog=page.locator('.ant-modal:visible');await dialog.getByLabel('变量名',{exact:true}).fill(name);if(secret)await dialog.getByLabel('Secret',{exact:true}).setChecked(true);await dialog.getByLabel(secret?'新 Secret 值':'值（允许空字符串）',{exact:true}).fill(value);await confirm();}
 await page.goto(base+'/env');await variable('GLOBAL_VALUE','global');await variable('SECRET_ENV','ENV_SECRET_E2E',true);mark('browser-global-create');
 await page.getByRole('tab',{name:'Repository',exact:true}).click();await choose('Repository','E2E Repo (0 Profiles)');await page.getByRole('button',{name:'创建 Profile'}).click();await page.getByLabel('Profile 名称',{exact:true}).fill('E2E Profile');await confirm();await page.getByRole('button',{name:'设为 Default'}).click();await page.getByRole('button',{name:'变量',exact:true}).click();await variable('PROFILE_VALUE','profile');mark('browser-profile-create-default');
 const tasks=(await api('/crons')).data.data;assert.equal(tasks.length,3);
 for(const task of tasks){await page.goto(base+`/env?task=${task.id}`);await variable('TASK_VALUE','task');await page.getByRole('button',{name:'预览有效环境'}).click();await page.getByRole('columnheader',{name:'有效值',exact:true}).waitFor();if(!await page.getByRole('cell',{name:'GLOBAL_VALUE',exact:true}).isVisible())await page.locator('.ant-pagination-item-2').click();await page.getByRole('cell',{name:'GLOBAL_VALUE',exact:true}).waitFor();}mark('browser-task-overrides-preview');

 await page.goto(base+'/config');await page.getByRole('button',{name:'创建 Config Asset',exact:true}).waitFor();
 async function saveDialog(){const dialog=page.locator('.ant-modal:visible').last(),element=await dialog.elementHandle();await dialog.getByRole('button',{name:/确.*定/}).click();await element.waitForElementState('hidden');}
 async function asset(name,content,secret=false){await page.getByRole('button',{name:'创建 Config Asset',exact:true}).click();const dialog=page.locator('.ant-modal:visible').last();await dialog.getByLabel('Name',{exact:true}).fill(name);if(secret)await dialog.getByLabel('Secret',{exact:true}).setChecked(true);await dialog.getByLabel('Content (UTF-8 TEXT, ≤ 1 MiB)',{exact:true}).fill(content);await saveDialog();}
 await asset('E2E Config','CONFIG_REVISION_1');await asset('E2E Secret','CONFIG_SECRET_E2E',true);await asset('E2E Override','CONFIG_TASK_OVERRIDE');mark('browser-text-secret-assets-create');
 await page.getByRole('row').filter({hasText:'E2E Config'}).getByRole('button',{name:/编.*辑/}).click();await page.getByLabel('Content (UTF-8 TEXT, ≤ 1 MiB)',{exact:true}).fill('CONFIG_REVISION_2');await saveDialog();
 const library=(await api('/config-assets')).data,configAsset=library.find(x=>x.name==='E2E Config'),secretAsset=library.find(x=>x.name==='E2E Secret');assert.equal(configAsset.current_revision.revision_number,2);
 await page.getByRole('row').filter({hasText:'E2E Secret'}).getByRole('button',{name:/编.*辑/}).click();await page.getByText('Secret Content: Set — Keep Existing',{exact:true}).waitFor();assert.equal(await page.getByLabel('Content (UTF-8 TEXT, ≤ 1 MiB)',{exact:true}).count(),0);await page.locator('.ant-modal:visible').last().getByRole('button',{name:/取.*消/}).click();assert.equal((await api(`/config-assets/${secretAsset.id}/content`)).code,403);mark('browser-revision-increment-secret-keep');await page.screenshot({path:path.join(__dirname,'browser-config-assets.png'),fullPage:true});
 async function bind(assetName,target,operation='ATTACH') {await page.getByRole('button',{name:'添加 Config Binding',exact:true}).click();const dialog=page.locator('.ant-modal:visible').last();if(operation==='MASK')await choose('绑定操作','MASK',dialog);else await choose('Config Asset',assetName,dialog);await dialog.getByLabel('Target Path',{exact:true}).fill(target);await saveDialog();}
 await page.goto(base+`/repository-workspace?id=${repo.id}`);await page.getByRole('tab',{name:'Config',exact:true}).click();await bind('E2E Config','config.txt');await bind('E2E Secret (Secret)','secret.txt');mark('browser-repository-config-bindings');await page.screenshot({path:path.join(__dirname,'browser-repository-config.png'),fullPage:true});
 async function editTask(task){await page.goto(base+'/crontab');await page.getByRole('row').filter({hasText:task.name}).locator('.ant-dropdown-trigger').click();await page.getByText('编辑',{exact:true}).click();}
 for(const [index,task] of tasks.entries()){
   await editTask(task);await page.getByRole('tab',{name:'Config',exact:true}).click();
   if(index===0){await bind('E2E Override','config.txt');await bind('', 'secret.txt','MASK');}
   await page.getByRole('button',{name:'预览有效 Config',exact:true}).click();await page.getByText('Effective Config — 当前解析结果；执行开始时冻结 Revision',{exact:true}).waitFor();
   await page.getByRole('tab',{name:'Hooks',exact:true}).click();
   for(const [phase,command]of [
     ['BEFORE',String.raw`cat config.txt; echo ORDER_BEFORE; TOKEN=$(printf '%s%s' generated- private-e2e); printf '%s' "{\"environment\":{\"set\":{\"HOOK_TOKEN\":\"$TOKEN\"},\"secret\":[\"HOOK_TOKEN\"]}}" > "$PLATFORM_HOOK_OUTPUT"; echo "$TOKEN"`],
     ['AFTER_SUCCESS','cat config.txt; echo ORDER_SUCCESS'],['AFTER_FAILURE','echo ORDER_FAILURE'],['FINALLY','cat config.txt; echo ORDER_FINALLY']]){
     await page.getByRole('tab',{name:phase,exact:true}).click();await page.getByRole('button',{name:`添加 ${phase} Hook`,exact:true}).click();const dialog=page.locator('.ant-modal:visible').last();await dialog.getByLabel('Hook 名称',{exact:true}).fill(phase);await dialog.getByLabel('Command',{exact:true}).fill(command);await saveDialog();
   }
   await page.getByRole('tab',{name:'BEFORE',exact:true}).click();await page.getByRole('button',{name:'添加 BEFORE Hook',exact:true}).click();const first=page.locator('.ant-modal:visible').last();await first.getByLabel('Hook 名称',{exact:true}).fill('First');await first.getByLabel('Command',{exact:true}).fill('echo ORDER_FIRST; sleep 1');await first.getByLabel('Order',{exact:true}).fill('5');await saveDialog();if(index===0)await page.screenshot({path:path.join(__dirname,'browser-task-hooks.png'),fullPage:true});
   await page.locator('.ant-modal:visible').getByRole('button',{name:/取.*消/}).click();
 }
 mark('browser-task-override-mask-preview-four-phase-hooks');
 for(const [index,task] of tasks.entries()){await page.goto(base+'/crontab');const row=page.getByRole('row').filter({hasText:task.name});await row.getByText('运行',{exact:true}).click();await confirm();await until(async()=>JSON.stringify(await api(`/crons/${task.id}/log`)).includes('[PREPARE]'));assert.equal((await api(`/scripts/detail?path=subscription-${sub.id}&file=config.txt`)).code,409);assert.equal((await api('/scripts/download','POST',{path:`subscription-${sub.id}`,filename:'config.txt'})).code,409);await row.getByText('日志',{exact:true}).click();await page.locator('.ant-modal:visible').waitFor();await until(async()=>{const r=await api(`/crons/${task.id}/log`);return JSON.stringify(r).includes('E2E_')&&JSON.stringify(r).includes('global:profile:task')&&JSON.stringify(r).includes('[CLEANUP] Completed');});const log=JSON.stringify(await api(`/crons/${task.id}/log`));assert.ok(log.includes(index===0?'CONFIG_TASK_OVERRIDE':'CONFIG_REVISION_2'));for(const token of forbidden)assert.ok(!log.includes(token));const order=['ORDER_FIRST','ORDER_BEFORE','E2E_','ORDER_SUCCESS','ORDER_FINALLY','[CLEANUP] Completed'].map(x=>log.indexOf(x));assert.ok(order.every((x,i)=>x>=0&&(i===0||x>order[i-1])));assert.ok(!log.includes('ORDER_FAILURE'));assert.equal(fs.existsSync(path.join(tmp,`data/scripts/subscription-${sub.id}/config.txt`)),false);await page.locator('.ant-modal:visible .ant-modal-close').click();}mark('browser-three-language-run-logs');
 // Exercise the actual edit toggle and prepare binding after disable/enable.
 for(const disabled of [true,false]){await page.goto(base+'/subscription');await page.getByRole('row').filter({hasText:'E2E Subscription'}).locator('.ant-dropdown-trigger').click();await page.getByText('编辑',{exact:true}).click();await page.getByLabel('禁用',{exact:true}).setChecked(disabled);await confirm();assert.equal((await api('/subscriptions')).data[0].is_disabled,disabled?1:0);}mark('browser-disable-enable');
 await page.screenshot({path:path.join(__dirname,'browser-subscription.png'),fullPage:true});

 await page.goto(base+'/runtime-python');await page.getByRole('button',{name:'设置 Provider',exact:true}).click();
 const runtimeApi='/runtime/python';
 const latest=async()=> (await api(runtimeApi+'/operations')).data[0];
 const runtimeDone=async(expected='SUCCESS')=>{const title=page.locator('.ant-modal:visible .ant-modal-title').filter({hasText:/^Runtime Operation #\d+$/});await title.waitFor();const id=Number((await title.innerText()).split('#')[1]);let current;await until(async()=>{current=(await api(runtimeApi+'/operations/'+id)).data;return current&&!['QUEUED','RUNNING'].includes(current.status);});assert.equal(current.status,expected,JSON.stringify(current));await page.locator('.ant-modal:visible p').filter({hasText:new RegExp(' · '+expected+' · ')}).waitFor();};
 const closeRuntimeLog=async()=>{await page.locator('.ant-modal:visible .ant-modal-close').click();await page.locator('.ant-modal:visible').waitFor({state:'hidden'});};
 await runtimeDone();await page.getByLabel('Runtime operation log').waitFor();await closeRuntimeLog();mark('runtime-browser-provider-setup-fixture');
 async function installPython(version){await page.getByRole('button',{name:'安装 Python',exact:true}).click();const dialog=page.locator('.ant-modal:visible');await choose('Exact Python Version',version,dialog);await dialog.getByRole('button',{name:/确.*定/}).click();await page.getByLabel('Runtime operation log').waitFor();}
 await installPython('3.12.12');await runtimeDone();await closeRuntimeLog();mark('runtime-browser-exact-install-live-log');
 const pythonRow=()=>page.getByRole('row').filter({has:page.getByRole('cell',{name:'3.12.12',exact:true})});
 await pythonRow().getByRole('button',{name:'验证 / Test',exact:true}).click();await runtimeDone();await closeRuntimeLog();
 await pythonRow().getByRole('button',{name:/详.*情/}).click();await page.getByText('Build Timestamp',{exact:true}).waitFor();await closeRuntimeLog();mark('runtime-browser-verify-metadata-references');
 await pythonRow().getByRole('button',{name:/修.*复/}).click();await page.locator('.ant-popover:visible').getByRole('button',{name:/确.*定/}).click();await runtimeDone();await closeRuntimeLog();mark('runtime-browser-repair');
 await installPython('3.13.12');await page.locator('.ant-modal:visible').getByRole('button',{name:'取消操作',exact:true}).click();await runtimeDone('CANCELLED');await closeRuntimeLog();mark('runtime-browser-cancel-partial');
 await page.screenshot({path:path.join(__dirname,'browser-runtime-python.png'),fullPage:true});
 const installedBeforeRestart=(await api(runtimeApi+'/installations')).data;assert.equal(installedBeforeRestart.length,2);

 await stop();await start();await page.evaluate(()=>localStorage.removeItem('token'));await page.goto(base+'/login');await login();mark('restart-relogin');
 assert.equal((await api('/crons')).data.data.length,3);assert.equal((await api('/subscriptions')).data[0].worktree_id,sub.worktree_id||1);

 assert.equal((await api(runtimeApi+'/installations')).data.length,2);await page.goto(base+'/runtime-python');
 for(const version of ['3.12.12','3.13.12']){await page.getByRole('row').filter({has:page.getByRole('cell',{name:version,exact:true})}).getByRole('button',{name:/删.*除/}).click();await page.locator('.ant-popover:visible').getByRole('button',{name:/确.*定/}).click();await runtimeDone();await closeRuntimeLog();}
 assert.equal((await api(runtimeApi+'/installations')).data.length,0);mark('runtime-browser-restart-remove');


 await installPython('3.13.15');await runtimeDone();await closeRuntimeLog();mark('environment-real-prebuilt-managed-cpython');
 const envApi=runtimeApi+'/environments';
 await page.getByRole('tab',{name:'Environments',exact:true}).click();await page.getByRole('button',{name:'创建环境',exact:true}).click();
 modal=page.locator('.ant-modal:visible');await modal.getByLabel('Environment Name',{exact:true}).fill('E2E Python Environment');await modal.getByLabel('Dependencies — 每行一个 PEP 508 requirement',{exact:true}).fill('ql-phase7-root==1.0.0');await modal.getByRole('button',{name:'保存并构建',exact:true}).click();
 await runtimeDone();await closeRuntimeLog();mark('environment-create-real-venv-local-wheel-live-log');
 const environment=(await api(envApi)).data.find(x=>x.name==='E2E Python Environment');assert.equal(environment.health,'HEALTHY');const firstBuild=environment.current_build_id;
 await page.getByRole('tab',{name:'Dependencies',exact:true}).click();await page.getByRole('cell',{name:'ql-phase7-leaf',exact:true}).waitFor();mark('environment-desired-resolved-separation');
 await page.getByRole('button',{name:'编辑依赖并构建',exact:true}).click();modal=page.locator('.ant-modal:visible');await modal.getByLabel('Dependencies — 每行一个 PEP 508 requirement',{exact:true}).fill('ql-phase7-root==2.0.0');await modal.getByRole('button',{name:'保存并构建',exact:true}).click();await runtimeDone();await closeRuntimeLog();
 const secondBuild=(await api(envApi+'/'+environment.id)).data.current_build_id;assert.notEqual(firstBuild,secondBuild);mark('environment-new-revision-generation');
 await page.getByRole('tab',{name:'Builds',exact:true}).click();const compare=page.getByText('选择两个 Build 比较',{exact:true});await compare.locator('xpath=ancestor::div[contains(@class,"ant-select-selector")]').click();await page.locator('.ant-select-dropdown:visible').getByText('Build #'+firstBuild,{exact:true}).click();await page.locator('.ant-select-dropdown:visible').getByText('Build #'+secondBuild,{exact:true}).click();await page.keyboard.press('Escape');await page.getByRole('button',{name:'比较构建',exact:true}).click();await page.getByLabel('Build dependency diff').filter({hasText:'ql-phase7-root'}).waitFor();mark('environment-build-diff');
 const buildRow=id=>page.getByRole('row').filter({has:page.getByRole('cell',{name:'#'+id,exact:true})});
 await buildRow(firstBuild).getByRole('button',{name:'设为 Current',exact:true}).click();await runtimeDone();await closeRuntimeLog();assert.equal((await api(envApi+'/'+environment.id)).data.current_build_id,firstBuild);mark('environment-promote-old-build');
 await buildRow(secondBuild).getByRole('button',{name:'删除构建',exact:true}).click();await page.locator('.ant-popover:visible').getByRole('button',{name:/确.*定/}).click();await runtimeDone();await closeRuntimeLog();mark('environment-delete-unused-build');
 await page.screenshot({path:path.join(__dirname,'browser-python-environments.png'),fullPage:true});
 const liveRuntime=(await api(runtimeApi+'/installations')).data.find(x=>x.version==='3.13.15');assert.equal((await api(runtimeApi+'/installations/'+liveRuntime.id,'DELETE',{})).message,'RUNTIME_REFERENCED');mark('environment-runtime-delete-protected');
 await stop();await start();await page.evaluate(()=>localStorage.removeItem('token'));await page.goto(base+'/login');await login();await page.goto(base+'/runtime-python');await page.getByRole('tab',{name:'Environments',exact:true}).click();await page.getByRole('button',{name:'E2E Python Environment',exact:true}).click();
 const restored=(await api(envApi)).data.find(x=>x.id===environment.id);assert.equal(restored.current_build_id,firstBuild);assert.equal(restored.health,'HEALTHY');assert.equal((await api(envApi+'/'+environment.id+'/resolve')).code,200);mark('environment-restart-health-resolver');
 await page.getByRole('button',{name:'删除环境',exact:true}).click();await page.locator('.ant-popover:visible').getByRole('button',{name:/确.*定/}).click();await runtimeDone();await closeRuntimeLog();assert.equal((await api(envApi)).data.length,0);mark('environment-delete-preserves-runtime-cache');
 await page.getByRole('tab',{name:'Versions',exact:true}).click();await page.getByRole('row').filter({has:page.getByRole('cell',{name:'3.13.15',exact:true})}).getByRole('button',{name:/删.*除/}).click();await page.locator('.ant-popover:visible').getByRole('button',{name:/确.*定/}).click();await runtimeDone();await closeRuntimeLog();
 evidence.python_environment={runtime:'REAL_PREBUILT_MANAGED_CPYTHON_3.13.15',pip:'REAL_LOOPBACK_WHEEL_INDEX',first_build:firstBuild,second_build:secondBuild};
 const previousLog=JSON.stringify(await api(`/crons/${tasks[0].id}/log`));assert.equal((await api('/crons/run','PUT',[tasks[0].id])).code,200);await until(async()=>{const currentLog=JSON.stringify(await api(`/crons/${tasks[0].id}/log`));return currentLog!==previousLog&&currentLog.includes('global:profile:task')&&currentLog.includes('[CLEANUP] Completed');});mark('restart-repeat-execution');
 for(const dir of ['repo','raw'])assert.equal(fs.existsSync(path.join(tmp,'data',dir)),false);
 const {Sequelize,QueryTypes}=require('sequelize');const db=new Sequelize({dialect:'sqlite',storage:path.join(tmp,'data/db/database.sqlite'),logging:false});assert.deepEqual(await db.query('PRAGMA foreign_key_check',{type:QueryTypes.SELECT}),[]);assert.equal((await db.query('SELECT platform_schema_version FROM PlatformMetadata',{type:QueryTypes.SELECT}))[0].platform_schema_version,4);await db.close();
 await delay(300);assert.deepEqual(leaks,[]);evidence.response_payloads_inspected=inspected.length;evidence.websocket_frames_inspected=websocketFrames;assert.ok(websocketFrames>0,'real WebSocket frames must be inspected');mark('browser-secret-response-audit');evidence.runtime_provider='DETERMINISTIC_FIXTURE';evidence.status='PASS';mark('fresh-v4-fk-layout');for(const suffix of ['png','txt'])fs.rmSync(path.join(__dirname,'browser-failure.'+suffix),{force:true});
})().catch(async error=>{evidence.status='FAIL';evidence.error=error.message;console.error(error);if(fs.existsSync(path.join(tmp,'data/log'))){for(const f of fs.readdirSync(path.join(tmp,'data/log'),{recursive:true})){const p=path.join(tmp,'data/log',f);if(fs.statSync(p).isFile()&&!f.includes('subscription-1/'))console.error(f,fs.readFileSync(p,'utf8').slice(-2500));}}if(fs.existsSync(path.join(tmp,'data/log/subscription-1'))){for(const f of fs.readdirSync(path.join(tmp,'data/log/subscription-1')))console.error(fs.readFileSync(path.join(tmp,'data/log/subscription-1',f),'utf8'));}if(page)try{await page.screenshot({path:path.join(__dirname,'browser-failure.png'),fullPage:true});fs.writeFileSync(path.join(__dirname,'browser-failure.txt'),await page.locator('body').innerText());}catch{}process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await stop();if(packageIndex)await packageIndex.close();for(const c of connections)c.end();if(ssh)ssh.close();fs.writeFileSync(path.join(__dirname,'platform-e2e.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(__dirname,'platform-e2e-backend.log'),output);fs.rmSync(tmp,{recursive:true,force:true});});
