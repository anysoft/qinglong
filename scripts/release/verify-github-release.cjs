'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const r=JSON.parse(fs.readFileSync('release-output/github-release.json'));assert.equal(r.tagName,process.env.GITHUB_REF_NAME);assert.equal(r.isDraft,false);assert.equal(r.isPrerelease,r.tagName.includes('-'));
const dir=fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'platform-release-verify-'));
try{execFileSync('gh',['release','download',r.tagName,'--dir',dir],{stdio:'pipe'});for(const line of fs.readFileSync(dir+'/SHA256SUMS','utf8').trim().split('\n')){const m=/^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);assert.ok(m);const file=dir+'/'+m[2];assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),m[1]);}}finally{fs.rmSync(dir,{recursive:true,force:true});}
