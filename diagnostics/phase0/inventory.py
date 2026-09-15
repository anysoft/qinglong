"""Read tracked source only; print evidence inventory. Never inspect user data/secrets."""
import pathlib
import re
import subprocess

root = pathlib.Path(__file__).resolve().parents[2]
files = subprocess.check_output(['git', 'ls-files'], cwd=root, text=True).splitlines()
patterns = {
    'Runtime Command Inventory': r'\b(python3?|pip3?|node|npm|pnpm|yarn|ts-node(?:-transpile-only)?)\b',
    'Global ENV Read Inventory': r'process\.env|os\.(?:getenv|environ)|file_env|envFile|jsEnvFile|pyEnvFile|\$\{?(?:PYTHONPATH|NODE_PATH|PATH|HOME|QL_DIR|QL_DATA_DIR)',
    'Deployment Assumptions Inventory': r'/\.dockerenv|QL_CONTAINER|[Dd]ocker|[Aa]lpine|[Dd]ebian|\b(?:apk|apt-get|yum)\b|/root|/home|QL_DIR|QL_DATA_DIR',
}
print('# Phase 0 源码证据清单\n\n由 `python3 diagnostics/phase0/inventory.py` 生成。仅扫描 Git 跟踪的源码；行级候选含注释、声明和构建配置，不能将每条命中视为运行时调用。具体语义见 03/04/05/06 文档。\n')
for title, pattern in patterns.items():
    print('## ' + title + '\n\n| File:line | Enclosing symbol / scope | Evidence |\n|---|---|---|')
    for name in files:
        if not name.startswith(('back/', 'shell/', 'sample/', 'src/', 'docker/', 'deploy/', 'scripts/')) and name not in ('ecosystem.config.js', 'package.json', '.umirc.ts'):
            continue
        if pathlib.Path(name).suffix not in ('.ts','.tsx','.js','.cjs','.mjs','.py','.sh','.yaml','.yml','.json') and 'Dockerfile' not in name:
            continue
        try:
            lines=(root/name).read_text().splitlines()
        except (UnicodeError, OSError):
            continue
        symbol='module / top-level'
        for line_no,line in enumerate(lines,1):
            m=re.search(r'(?:function\s+|def\s+|(?:public |private )?(?:async )?)([A-Za-z_]\w*)\s*\([^;]*\)\s*(?::[^=]+)?\s*\{|^([A-Za-z_]\w*)\(\)\s*\{|^def ([A-Za-z_]\w*)',line.strip())
            if m: symbol=next(x for x in m.groups() if x)
            if re.search(pattern,line):
                evidence=line.strip().replace('|','\\|').replace('`','\\`')
                print(f'| `{name}:{line_no}` | {symbol} (nearest textual declaration) | {evidence} |')
