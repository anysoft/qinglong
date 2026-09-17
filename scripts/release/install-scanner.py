#!/usr/bin/env python3
import urllib.request, hashlib, tarfile, io, pathlib, platform, os
version='0.73.0'
assets={'x86_64':('64bit','2edd39da482bb4e9831962487b68f68e3928ec3137794757f54d00383d79547b'),'aarch64':('ARM64','13833d97e8a1a5367471c372a173180157f593bece570e20d5d925fef552f5dd')}
arch,digest=assets[platform.machine()]
url=f'https://github.com/aquasecurity/trivy/releases/download/v{version}/trivy_{version}_Linux-{arch}.tar.gz'
data=urllib.request.urlopen(url,timeout=60).read();assert hashlib.sha256(data).hexdigest()==digest,'SCANNER_CHECKSUM'
root=pathlib.Path('release-tools');root.mkdir(exist_ok=True)
with tarfile.open(fileobj=io.BytesIO(data)) as archive:
    member=archive.getmember('trivy');assert member.isfile()
    target=root/'trivy';temporary=root/'trivy.part'
    with temporary.open('xb') as f:f.write(archive.extractfile(member).read());f.flush();os.fsync(f.fileno())
    temporary.chmod(0o755);temporary.replace(target)
