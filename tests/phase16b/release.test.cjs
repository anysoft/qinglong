const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {metadata}=require('../../scripts/release/metadata.cjs');
const sha='a'.repeat(40);
test('strict release identity and prerelease tags fail closed',()=>{
 assert.deepEqual(metadata('v1.0.0','1.0.0',sha).tags,['1.0.0','1.0','1','latest','sha-'+sha]);
 assert.deepEqual(metadata('v1.0.0-rc.1','1.0.0-rc.1',sha).tags,['1.0.0-rc.1','sha-'+sha]);
 for(const tag of ['v01.0.0','v1.0','v1.0.0-01','v1.0.0+build','latest','v1.0.0;touch /tmp/x'])assert.throws(()=>metadata(tag,tag.slice(1),sha));
 assert.throws(()=>metadata('v1.0.1','1.0.0',sha));assert.throws(()=>metadata('v1.0.0','1.0.0','bad'));
});
test('container gate rejects missing or failed acceptance evidence',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'release-gates-'));
 try{const p=spawnSync(process.execPath,['scripts/release/gates.cjs'],{env:{...process.env,RELEASE_OUTPUT:tmp},encoding:'utf8'});assert.notEqual(p.status,0);assert.equal(fs.existsSync(path.join(tmp,'container-gates.json')),false);}finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('image boundaries keep secret sources out and native compilation target-specific',()=>{
 const docker=fs.readFileSync('Dockerfile','utf8'),ignore=fs.readFileSync('.dockerignore','utf8'),compose=fs.readFileSync('compose.yaml','utf8');
 assert.doesNotMatch(docker,/BUILDPLATFORM|\/ql\/data|task\.sh|otask\.sh|crond|pm2|ARG.*(?:SECRET|TOKEN|PASSWORD)|COPY.*\.env/);
 assert.match(docker,/USER 10001:10001/);assert.match(docker,/--frozen-lockfile/);assert.match(ignore,/^\*\n/);assert.doesNotMatch(ignore,/!\.env/);
 assert.match(compose,/DATA_DIR: \/data\/state/);assert.match(compose,/read_only: true/);assert.doesNotMatch(compose,/privileged:|docker\.sock|network_mode: host|pid: host/);
});

test('container gate rejects empty scanner output even with passing other receipts',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'release-scan-'));
 try {
  const receipts={acceptance:{status:'PASS',cleanup:'PASS',commit:sha,architecture:'arm64',steps:[]},'image-audit':{status:'PASS',commit:sha,architecture:'arm64'},compose:{status:'PASS',cleanup:'PASS'},vulnerabilities:{}};
  for(const [name,value] of Object.entries(receipts))fs.writeFileSync(path.join(tmp,name+'.json'),JSON.stringify(value));
  const result=spawnSync(process.execPath,['scripts/release/gates.cjs'],{env:{...process.env,GITHUB_SHA:sha,RELEASE_OUTPUT:tmp},encoding:'utf8'});
  assert.notEqual(result.status,0);assert.match(result.stderr,/INVALID_VULNERABILITY_REPORT/);
  assert.equal(fs.existsSync(path.join(tmp,'container-gates.json')),false);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
