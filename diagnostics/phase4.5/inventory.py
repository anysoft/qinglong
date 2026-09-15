#!/usr/bin/env python3
"""Read source only; writes review inventories beside this script. No app imports."""
from pathlib import Path
import re,json,subprocess
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
roots=['back','src','shell','docker','deploy','sample','test','tests','scripts']
files=sorted(p for base in roots for p in (ROOT/base).rglob('*') if p.is_file() and not any(x in p.parts for x in ['node_modules','.umi','__pycache__']))
patterns={
 'compatibility':r'\blegacy\b|\bmanaged\b|git_mode|\bcompat\w*|\bfallback\b|\bmigration\b|\bold\b|\bdeprecated\b',
 'git-paths':r'git\s+(?:clone|fetch|pull|worktree)|git_clone_scripts|update_repo|ql repo|repoPath|dir_repo|repo_path|uniq_path|legacyCheckoutName',
 'scripts-consumers':r'scriptPath|dir_scripts|data/scripts|scriptsRoot|scripts/|enter_script_workdir',
 'crontab-consumers':r'crontab\.list|crontabFile|list_crontab_user|importCrontab|setCrontab|autosave_crontab',
 'internal-api':r'/open|api\.sh|add_cron_api|del_cron_api|update_cron|record_cron_stat|notify_api',
 'env-paths':r'env\.(?:py|js|sh)|set_envs|process\.env\[|process\.env\.[A-Za-z_]+\s*=|os\.environ\[|env_profile_id|PREV_PYTHONPATH|PREV_NODE_OPTIONS',
 'nullable-fallback':r'allowNull|\?\?|fallback|git_mode|legacy_url',
}
for name,pattern in patterns.items():
 rows=[];regex=re.compile(pattern,re.I)
 for p in files:
  try:lines=p.read_text().splitlines()
  except (UnicodeError,OSError):continue
  rows += [{'file':str(p.relative_to(ROOT)),'line':i,'text':line.strip()} for i,line in enumerate(lines,1) if regex.search(line)]
 (OUT/(name+'.json')).write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
api=[]
for p in sorted((ROOT/'back/api').glob('*.ts')):
 s=p.read_text();mounts=re.findall(r"app\.use\(\s*(['\"`])(.*?)\1",s,re.S)
 endpoints=[]
 for m in re.finditer(r"\b(app|router|route|credentials|repositories)\.(get|post|put|delete|patch|all|use)\(\s*(['\"`])(.*?)\3",s,re.S):
  endpoints.append({'line':s.count('\n',0,m.start())+1,'receiver':m[1],'method':m[2].upper(),'path':m[4]})
 api.append({'file':str(p.relative_to(ROOT)),'mounts':[x[1] for x in mounts],'endpoints':endpoints})
(OUT/'api-routes.json').write_text(json.dumps(api,ensure_ascii=False,indent=2)+'\n')
tests=[]
for p in files:
 if p.name.endswith(('.test.cjs','.test.ts','.test.js')):
  s=p.read_text();titles=[m[2] for m in re.finditer(r"\b(?:test|it|describe)\(\s*(['\"`])(.*?)\1",s,re.S)]
  tests.append({'file':str(p.relative_to(ROOT)),'titles':titles})
(OUT/'test-cases.json').write_text(json.dumps(tests,ensure_ascii=False,indent=2)+'\n')
(OUT/'source-files.json').write_text(json.dumps([str(p.relative_to(ROOT)) for p in files],indent=2)+'\n')
print(json.dumps({'files':len(files),'api_files':len(api),'route_declarations':sum(len(x['endpoints']) for x in api),'test_files':len(tests)}))
