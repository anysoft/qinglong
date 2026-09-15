const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),{execFileSync}=require('node:child_process');
// Deterministic pure-Python wheels built with stdlib zipfile; no wheel/build/PyPI prerequisite.
async function wheelhouse(root){
 await fs.mkdir(root,{recursive:true});
 const script=String.raw`import base64,csv,hashlib,io,json,pathlib,sys,zipfile,tarfile
root=pathlib.Path(sys.argv[1])
for package in ['ql_phase7_leaf','ql_phase7_root']:
 for version in ['1.0.0','2.0.0']:
  dist=package+'-'+version+'.dist-info'
  dependency=('Requires-Dist: ql-phase7-leaf=='+version+'\n') if package.endswith('root') else ''
  files={package+'/__init__.py':('__version__ = '+repr(version)+'\n').encode(),dist+'/METADATA':('Metadata-Version: 2.1\nName: '+package.replace('_','-')+'\nVersion: '+version+'\n'+dependency+'\n').encode(),dist+'/WHEEL':b'Wheel-Version: 1.0\nGenerator: platform-offline-fixture\nRoot-Is-Purelib: true\nTag: py3-none-any\n'}
  record=io.StringIO(); writer=csv.writer(record,lineterminator='\n')
  for name,data in files.items():writer.writerow([name,'sha256='+base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b'=').decode(),str(len(data))])
  writer.writerow([dist+'/RECORD','','']);files[dist+'/RECORD']=record.getvalue().encode()
  target=root/(package+'-'+version+'-py3-none-any.whl')
  with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
   for name,data in files.items():
    info=zipfile.ZipInfo(name,date_time=(2024,1,1,0,0,0));info.external_attr=0o644<<16;archive.writestr(info,data)
# PEP 517 slow backend has no build requirements; cancellation must reap its TERM-ignoring child.
for kind in ['slow','fail']:
 name='ql_phase7_'+kind; prefix=name+'-1.0.0'
 backend="import os,subprocess,sys,time\ndef get_requires_for_build_wheel(config_settings=None):\n " + ("child=subprocess.Popen([sys.executable,'-c',\"import signal,time;signal.signal(signal.SIGTERM,signal.SIG_IGN);time.sleep(120)\"]);print('PHASE7_SLOW_CHILD:'+str(child.pid)+' PHASE7_SLOW_READY'+'_'*4096,flush=True);time.sleep(120);return []\n" if kind=='slow' else "raise RuntimeError('CONTROLLED_BUILD_FAILURE')\n")
 files={'pyproject.toml':'[build-system]\nrequires = []\nbuild-backend = "backend"\nbackend-path = ["."]\n','backend.py':backend,'PKG-INFO':'Metadata-Version: 2.1\nName: '+name.replace('_','-')+'\nVersion: 1.0.0\n'}
 with tarfile.open(root/(prefix+'.tar.gz'),'w:gz') as archive:
  for filename,data in files.items():
   payload=data.encode();info=tarfile.TarInfo(prefix+'/'+filename);info.size=len(payload);info.mtime=0;archive.addfile(info,io.BytesIO(payload))
`;
 execFileSync('/usr/bin/python3',['-I','-S','-c',script,root]);
 const files=await fs.readdir(root),requests=[];
 const server=http.createServer(async(req,res)=>{requests.push(req.url);const name=decodeURIComponent((req.url??'').split('?')[0]);
  try{if(name.startsWith('/simple/')){const pkg=name.split('/')[2]?.replace(/-/g,'_');const found=files.filter(x=>x.startsWith(pkg+'-'));res.writeHead(200,{'content-type':'text/html'});res.end(found.map(x=>`<a href="/artifacts/${x}">${x}</a>`).join('\n'));}
  else {const item=name.slice('/artifacts/'.length);if(!name.startsWith('/artifacts/')||!files.includes(item))throw Error('404');res.end(await fs.readFile(path.join(root,item)));}}
  catch{res.writeHead(404);res.end('not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {index:`http://127.0.0.1:${server.address().port}/simple`,requests,close:()=>new Promise(resolve=>server.close(resolve))};
}
module.exports={wheelhouse};
