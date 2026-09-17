'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {metadata,branchGate}=require('./metadata.cjs');
const meta=metadata(process.env.GITHUB_REF_NAME);branchGate(process.env.RELEASE_BRANCH,meta.sha);
const image=process.env.DOCKERHUB_IMAGE;assert.match(image||'',/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/);
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'inherit'});const sources=[];
for(const arch of ['amd64','arm64']){
 const dir='release-input/'+arch,gate=JSON.parse(fs.readFileSync(dir+'/container-gates.json'));assert.equal(gate.status,'PASS');assert.equal(gate.commit,meta.sha);assert.equal(gate.architecture,arch);
 // All bytes are the immutable qualification artifact. No second build.
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(dir+'/image.tar')).digest('hex'),gate.image.archive_sha256);
 const ref=image+':sha-'+meta.sha+'-'+arch;
 run('skopeo',['copy','--all','--preserve-digests','oci-archive:'+dir+'/image.tar','docker://'+ref]);sources.push(ref);
}
run('docker',['buildx','imagetools','create',...meta.tags.flatMap(t=>['--tag',image+':'+t]),...sources]);
run(process.execPath,['scripts/release/verify-release.cjs']);
