'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {metadata}=require('./metadata.cjs');
const command=(...a)=>execFileSync('docker',a,{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
function inspect(image,expected,attestations=[]){
  const raw=command('buildx','imagetools','inspect','--raw',image),index=JSON.parse(raw);assert.ok(index.manifests,'MANIFEST_LIST_REQUIRED');
  const actual=index.manifests.filter(m=>m.platform?.os==='linux'&&['amd64','arm64'].includes(m.platform.architecture));
  assert.deepEqual(actual.map(m=>m.platform.architecture).sort(),['amd64','arm64']);
  for(const m of actual)assert.equal(m.digest,expected[m.platform.architecture],'PUBLISHED_BYTES_DIFFER');
  for(const digest of attestations)assert.ok(index.manifests.some(m=>m.digest===digest),'PUBLISHED_ATTESTATION_MISSING');
  const descriptor=JSON.parse(command('buildx','imagetools','inspect','--format','{{json .Manifest}}',image));assert.match(descriptor.digest,/^sha256:[a-f0-9]{64}$/);return descriptor.digest;
}
if(require.main===module){const meta=metadata(process.env.GITHUB_REF_NAME),image=process.env.DOCKERHUB_IMAGE;assert.match(image||'',/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/);const expected={},attestations=[];for(const arch of ['amd64','arm64']){const gate=JSON.parse(fs.readFileSync('release-input/'+arch+'/container-gates.json'));assert.equal(gate.status,'PASS');assert.equal(gate.commit,meta.sha);expected[arch]=gate.image.manifest_digest;assert.ok(gate.image.attestation_digests?.length,'QUALIFIED_ATTESTATIONS_REQUIRED');attestations.push(...gate.image.attestation_digests);}const digests=meta.tags.map(tag=>inspect(image+':'+tag,expected,attestations));assert.equal(new Set(digests).size,1,'TAG_DIGEST_MISMATCH');fs.mkdirSync('release-output',{recursive:true});fs.writeFileSync('release-output/published-manifest.json',JSON.stringify({...meta,image,digest:digests[0],platforms:expected,status:'PASS'},null,2)+'\n');}
module.exports={inspect};
