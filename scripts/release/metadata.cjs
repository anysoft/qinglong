'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
function metadata(tag, version=require('../../package.json').version, sha=process.env.GITHUB_SHA) {
  const m=/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/.exec(tag||'');
  assert.ok(m,'INVALID_RELEASE_TAG');assert.equal(tag.slice(1),version,'TAG_VERSION_MISMATCH');assert.match(sha||'',/^[a-f0-9]{40}$/);
  return {version,sha,prerelease:!!m[4],tags:m[4]?[version,'sha-'+sha]:[version,m[1]+'.'+m[2],m[1],'latest','sha-'+sha]};
}
function branchGate(branch,sha) {
  assert.match(branch||'',/^[A-Za-z0-9][A-Za-z0-9._/-]*$/);assert.ok(!branch.includes('..')&&!branch.endsWith('/'),'INVALID_RELEASE_BRANCH');
  execFileSync('git',['check-ref-format','refs/heads/'+branch]);
  execFileSync('git',['fetch','--no-tags','origin','+refs/heads/'+branch+':refs/remotes/origin/'+branch],{stdio:'pipe'});
  execFileSync('git',['merge-base','--is-ancestor',sha,'refs/remotes/origin/'+branch],{stdio:'pipe'});
}
if(require.main===module){const result=metadata(process.env.GITHUB_REF_NAME);branchGate(process.env.RELEASE_BRANCH,result.sha);fs.mkdirSync('release-output',{recursive:true});fs.writeFileSync('release-output/metadata.json',JSON.stringify(result,null,2)+'\n');}
module.exports={metadata,branchGate};
