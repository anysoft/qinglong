const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
function extract(file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf(`${name}() {`);
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, name);
  return source.slice(start, end + 2);
}
function run(command, args, cwd, env = {}) {
  const r = spawnSync(command, args, {cwd, env: {...process.env, ...env}, encoding:'utf8', timeout:20000});
  assert.equal(r.status, 0, `${command}: ${r.error || ''}\n${r.stderr}\n${r.stdout}`);
  return r.stdout;
}
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ql-phase0-'));
  t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
  return dir;
}
const gitFunctions = ['get_uniq_path','update_repo','gen_list_repo','diff_scripts','diff_cron','add_cron','del_cron','output_list_add_drop'].map(n => extract('shell/update.sh',n)).join('\n') + '\n' + extract('shell/share.sh','git_clone_scripts');
function update(dir, branch='main') {
  return run('/bin/bash', ['-c', gitFunctions + `
make_dir() { mkdir -p "$1"; }
t() { :; }
set_proxy() { :; }
unset_proxy() { :; }
notify_api() { :; }
add_cron_api() { printf '%s\\n' "$1" >> "$TEST_DIR/created"; }
del_cron_api() { printf '%s\\n' "$1" >> "$TEST_DIR/deleted"; }
dir_repo="$TEST_DIR/repos"; dir_scripts="$TEST_DIR/scripts"; dir_list_tmp="$TEST_DIR/lists"
file_notify_js="$TEST_DIR/notify.js"; file_notify_py="$TEST_DIR/notify.py"
dir_dep="$TEST_DIR/deps"; list_crontab_user="$TEST_DIR/crontab.list"
cmd_task=task; SUB_ID=42; default_cron='0 0 * * *'; file_extensions='js py sh'
get_uniq_path "file://$TEST_DIR/origin" "$BRANCH"
update_repo "file://$TEST_DIR/origin" '' '' '' "$BRANCH" 'js|py|sh' '' true true
[[ "$exit_status" == 0 ]]
`], dir, {TEST_DIR:dir, BRANCH:branch});
}
function fixture(t) {
  const dir=temp(t);
  fs.cpSync(path.join(root,'fixtures/test-repo'),path.join(dir,'origin'),{recursive:true});
  for(const d of ['repos','scripts','lists']) fs.mkdirSync(path.join(dir,d));
  for(const f of ['notify.js','notify.py','crontab.list']) fs.writeFileSync(path.join(dir,f),'');
  const git=(...args)=>run('git',args,path.join(dir,'origin'));
  git('init','-b','main'); git('config','user.email','phase0@example.invalid'); git('config','user.name','Phase0');
  git('add','.');git('commit','-qm','fixture');
  return {dir,git, repo:()=>path.join(dir,'repos',fs.readdirSync(path.join(dir,'repos'))[0])};
}
test('real local clone, nested discovery, metadata and auto-create API payloads', t=>{
  const {dir,repo}=fixture(t);update(dir);
  assert.equal(run('git',['branch','--show-current'],repo()).trim(),'main');
  assert.equal(run('git',['rev-parse','--is-shallow-repository'],repo()).trim(),'true');
  const created=fs.readFileSync(path.join(dir,'created'),'utf8');
  assert.equal(created.trim().split('\n').length,4);
  assert.match(created,/7 8 \* \* \*:task .*python\/example.py:phase0-python:42/);
  // Nested basename-only annotations fall back: parser expects nested/annotated.js.
  assert.match(created,/0 0 \* \* \*:task .*nested\/annotated.js:phase0-annotation:42/);
});
for(const dirty of ['modified','untracked','local-commit','detached','conflict']) {
  test(`update deletes ${dirty} workspace and reclones upstream`, t=>{
    const {dir,git,repo}=fixture(t); update(dir);const working=repo();
    const g=(...args)=>run('git',args,working);
    g('config','user.email','phase0@example.invalid');g('config','user.name','Phase0');
    const file=path.join(working,'python/example.py');
    if(dirty==='untracked') fs.writeFileSync(path.join(working,'local-only'),'lost');
    else if(dirty==='detached') g('checkout','--detach');
    else {
      fs.writeFileSync(file,'local modification\n');
      if(dirty==='local-commit' || dirty==='conflict') {g('add','.');g('commit','-qm','local');}
      if(dirty==='conflict') {
        g('checkout','-b','other','HEAD~1');fs.writeFileSync(file,'other modification\n');g('add','.');g('commit','-qm','other');
        g('checkout','main');const merge=spawnSync('git',['merge','other'],{cwd:working,encoding:'utf8'});assert.equal(merge.status,1);
      }
    }
    fs.writeFileSync(path.join(dir,'origin/python/example.py'),'# cron: 7 8 * * *\nprint("upstream")\n');git('add','.');git('commit','-qm','upstream');
    update(dir);
    assert.equal(fs.readFileSync(file,'utf8'),'# cron: 7 8 * * *\nprint("upstream")\n');
    assert.equal(fs.existsSync(path.join(working,'local-only')),false);
    assert.equal(g('status','--porcelain').trim(),'');
    assert.equal(g('branch','--show-current').trim(),'main');
  });
}
test('different branches use separate clones; same URL and branch reuse destructive destination', t=>{
  const {dir,git}=fixture(t);git('checkout','-b','feature');fs.writeFileSync(path.join(dir,'origin/branch.txt'),'feature');git('add','.');git('commit','-qm','branch');
  update(dir,'main');update(dir,'feature');update(dir,'main');
  assert.equal(fs.readdirSync(path.join(dir,'repos')).length,2);
});
for(const [runtime,file] of [['python','python/example.py'],['node','node/example.js'],['shell','shell/example.sh']]) {
  test(`actual task.sh executes ${runtime}, injects ENV, captures output and reports status`, t=>{
    const dir=temp(t);fs.cpSync(path.join(root,'shell'),path.join(dir,'shell'),{recursive:true});
    fs.cpSync(path.join(root,'fixtures/test-repo'),path.join(dir,'data/scripts'),{recursive:true});
    fs.mkdirSync(path.join(dir,'data/config'),{recursive:true});fs.mkdirSync(path.join(dir,'data/log'),{recursive:true});
    for(const f of ['config.sh','crontab.list','task_before.sh','task_after.sh','task_before.js','task_before.py']) fs.writeFileSync(path.join(dir,'data/config',f),'');
    fs.writeFileSync(path.join(dir,'shell/api.sh'),`update_cron() { printf '%s\\n' "$*" >> "$QL_DIR/status"; }\nrecord_cron_stat() { printf '%s\\n' "$*" >> "$QL_DIR/stats"; }\n`);
    fs.writeFileSync(path.join(dir,'shell/preload/env.sh'),"export BASELINE_ENV='A&B'\n");
    fs.writeFileSync(path.join(dir,'shell/preload/env.js'),"process.env.BASELINE_ENV='A&B';\n");
    fs.writeFileSync(path.join(dir,'shell/preload/env.py'),"import os\nos.environ['BASELINE_ENV']='A&B'\n");
    fs.writeFileSync(path.join(dir,'shell/preload/client.js'),'module.exports={};');
    fs.writeFileSync(path.join(dir,'shell/preload/client.py'),'class Client: pass\n');
    fs.writeFileSync(path.join(dir,'shell/preload/__ql_notify__.js'),'exports.sendNotify=()=>{};');
    fs.writeFileSync(path.join(dir,'shell/preload/__ql_notify__.py'),'def send(*args): pass\n');
    run('/bin/bash',[path.join(dir,'shell/task.sh'),file,'now'],dir,{QL_DIR:dir,QL_DATA_DIR:path.join(dir,'data'),ID:'42',no_tee:'true'});
    const logs=fs.readdirSync(path.join(dir,'data/log'),{recursive:true}).filter(x=>x.endsWith('.log'));
    assert.equal(logs.length,1);
    assert.match(fs.readFileSync(path.join(dir,'data/log',logs[0]),'utf8'),new RegExp(`PHASE0 ${runtime} A&B`));
    assert.match(fs.readFileSync(path.join(dir,'stats'),'utf8'),/^42 0 /);
    assert.match(fs.readFileSync(path.join(dir,'status'),'utf8'),/"42" 1 /);
  });
}
