# Recover a slow official-source download with verified HTTP ranges; no runtime substitution.
import concurrent.futures, hashlib, pathlib, subprocess
source=pathlib.Path('/var/folders/zw/3r78x0_95dl5_cj7tpslfdq40000gn/T/platform-phase5-trrS0Y/tmp/runtime/python/operation-2/build/Python-3.13.15.tar.xz')
size=23160540
chunk=1024*1024
prefix=source.read_bytes(); prefix=prefix[:len(prefix)//chunk*chunk]
parts=pathlib.Path('/tmp/phase12-python-source-parts');parts.mkdir(exist_ok=True)
def download(start):
 end=min(size-1,start+chunk-1);target=parts/str(start);headers=parts/(str(start)+'.headers')
 subprocess.run(['curl','-sS','--fail','--connect-timeout','10','--max-time','180','--retry','2','-r',f'{start}-{end}','https://www.python.org/ftp/python/3.13.15/Python-3.13.15.tar.xz','-D',str(headers),'-o',str(target)],check=True)
 assert f'content-range: bytes {start}-{end}/{size}' in headers.read_text().lower()
 data=target.read_bytes();assert len(data)==end-start+1;print('verified range',start,flush=True);return data
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
 tail=list(pool.map(download,range(len(prefix),size,chunk)))
data=prefix+b''.join(tail)
assert hashlib.sha256(data).hexdigest()=='1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76'
pathlib.Path('/tmp/phase12-Python-3.13.15-verified.tar.xz').write_bytes(data)
print('SHA256 PASS',len(data),flush=True)
