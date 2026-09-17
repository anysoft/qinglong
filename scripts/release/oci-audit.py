#!/usr/bin/env python3
"""Read-only OCI archive validation; no tar member is extracted to the host filesystem."""
import sys, tarfile, json, hashlib, re, io, pathlib
archive, arch, sha, out = sys.argv[1:]
public_keys=set(json.loads(pathlib.Path(__file__).with_name("public-selftest-keys.json").read_text())["pem_sha256"])
public_key_matches=[]
with tarfile.open(archive) as tar:
    members = {m.name.removeprefix('./'): m for m in tar.getmembers() if m.isfile()}
    def read(name):
        m = members[name]
        assert m.size <= 1024**3, 'OVERSIZE_BLOB'
        return tar.extractfile(m).read()
    def blob(d):
        assert re.fullmatch(r'sha256:[a-f0-9]{64}',d['digest'])
        raw = read('blobs/sha256/'+d['digest'][7:])
        assert hashlib.sha256(raw).hexdigest() == d['digest'][7:], 'BLOB_DIGEST'
        return raw
    manifests=[]
    def visit(index):
        for d in index['manifests']:
            obj=json.loads(blob(d))
            if 'manifests' in obj: visit(obj)
            else: manifests.append((d,obj))
    visit(json.loads(read('index.json')))
    images=[(d,m) for d,m in manifests if d.get('platform',{}).get('architecture')==arch]
    assert len(images)==1, 'EXACTLY_ONE_TARGET_IMAGE'
    desc, manifest=images[0];cfg=json.loads(blob(manifest['config']))
    assert cfg['architecture']==arch and cfg['os']=='linux'
    assert cfg['config']['User']=='10001:10001'
    labels=cfg['config']['Labels'];assert labels['org.opencontainers.image.revision']==sha
    assert labels['org.opencontainers.image.version']==json.load(open('package.json'))['version']
    assert not any(re.match(r'(JWT_SECRET|.*TOKEN|.*PASSWORD|NODE_PATH|PYTHONPATH)=',e) for e in cfg['config'].get('Env',[])), 'BAKED_SECRET_OR_GLOBAL_ENV'
    attestations={};attestation_digests=[]
    for d,m in manifests:
        if d.get('annotations',{}).get('vnd.docker.reference.digest')!=desc['digest']: continue
        attestation_digests.append(d['digest'])
        for layer in m['layers']:
            obj=json.loads(blob(layer));kind=obj.get('predicateType','')
            if 'spdx' in kind: attestations['sbom']=obj
            if 'slsa' in kind: attestations['provenance']=obj
    assert set(attestations)=={'sbom','provenance'}, 'ATTESTATIONS_REQUIRED'
    sizes=[]
    for layer in manifest['layers']:
        raw=blob(layer);sizes.append({'digest':layer['digest'],'compressed_bytes':len(raw)})
        with tarfile.open(fileobj=io.BytesIO(raw)) as lt:
            for f in lt:
                name=f.name.removeprefix('./')
                assert not name.startswith(('app/.git/','app/tests/','app/test/','app/diagnostics/','app/back/')), 'SOURCE_OR_FIXTURES_IN_IMAGE'
                assert not (name.startswith('app/node_modules/') and any(part in ('test','tests','__tests__','fixtures') for part in name.split('/'))), 'DEPENDENCY_FIXTURES_IN_IMAGE'
                assert name not in ['app/.env','app/node_modules/typescript/package.json','app/node_modules/playwright/package.json'], 'DEV_OR_SECRET_FILE'
                if f.isfile():
                    assert not re.search(r'(^|/)(database\.sqlite|id_rsa|id_ed25519)$|\.platform-backup$',name),'PRIVATE_STATE_IN_IMAGE'
                    assert f.size <= 512*1024*1024, 'OVERSIZE_FILE_FOR_SECRET_SCAN'
                    data=lt.extractfile(f).read()
                    if re.fullmatch(r'usr/lib/(?:aarch64|x86_64)-linux-gnu/libgnutls\.so\.[0-9.]+',name):
                        for key in re.findall(rb'-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----.*?-----END (?:OPENSSH |RSA |EC )?PRIVATE KEY-----',data,re.S):
                            digest=hashlib.sha256(key).hexdigest()
                            if digest in public_keys:
                                public_key_matches.append({'path':name,'pem_sha256':digest})
                                data=data.replace(key,b'[verified public upstream self-test vector]')
                    assert not re.search(rb'-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----\r?\n(?:[A-Za-z0-9+/=]{16,}\r?\n){2}|fixture-[a-f0-9]{64}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',data),'IMAGE_SECRET_PATTERN:'+name
    output=pathlib.Path(out);output.mkdir(parents=True,exist_ok=True)
    for key,value in attestations.items():(output/(key+'.json')).write_text(json.dumps(value,indent=2)+'\n')
    result={'status':'PASS','architecture':arch,'commit':sha,'manifest_digest':desc['digest'],'config_digest':manifest['config']['digest'],'archive_sha256':hashlib.sha256(open(archive,'rb').read()).hexdigest(),'attestation_digests':attestation_digests,'public_upstream_selftest_vectors':public_key_matches,'secret_scan':'PASS','sbom':'PASS','provenance':'PASS','layers':sizes}
    (output/'image-audit.json').write_text(json.dumps(result,indent=2)+'\n')
