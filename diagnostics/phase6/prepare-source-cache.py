"""Diagnostic-only bounded download of a fixed official source; never imported by Runtime Manager."""
import concurrent.futures
import hashlib
import json
import pathlib
import re
import subprocess

root = pathlib.Path('/tmp/qinglong-phase6-source-cache')
root.mkdir(mode=0o700, exist_ok=True)
url = 'https://www.python.org/ftp/python/3.13.15/Python-3.13.15.tar.xz'
checksum = '1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76'
headers = (root / 'range-headers.txt').read_text()
match = re.search(r'content-range: bytes 0-0/(\d+)', headers, re.I)
if not match or (root / 'range-byte').stat().st_size != 1:
    raise RuntimeError('Server must support exact byte ranges')
size = int(match.group(1))

def download(index):
    start, end = size * index // 8, size * (index + 1) // 8 - 1
    target = root / ('part-' + str(index))
    subprocess.run(['/usr/bin/curl', '-q', '-sSfL', '--connect-timeout', '10', '--max-time', '240', '--range', f'{start}-{end}', url, '-o', str(target)], check=True)
    if target.stat().st_size != end - start + 1:
        raise RuntimeError('Unexpected range length')
    return target

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
    parts = list(executor.map(download, range(8)))
temporary = root / 'Python-3.13.15.complete.tmp'
hash_value = hashlib.sha256()
with temporary.open('wb') as output:
    for part in parts:
        data = part.read_bytes()
        output.write(data)
        hash_value.update(data)
if hash_value.hexdigest() != checksum:
    temporary.unlink()
    raise RuntimeError('Official definition SHA256 mismatch')
final = root / 'Python-3.13.15.complete.tar.xz'
temporary.replace(final)
print(json.dumps({'status': 'PASS', 'url': url, 'sha256': checksum, 'bytes': size, 'cache': str(final)}))
