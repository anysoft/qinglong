"""Reproduce the post-timeout Darwin EPERM race through the real Git helper."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import tempfile

helper = str(Path(__file__).resolve().parents[2] / 'shell/git_workspace_lock.py')

def exercise(worker):
    with tempfile.TemporaryDirectory() as directory:
        process = subprocess.Popen(['python3', '-I', '-S', helper, '[]', '{}'],
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        try:
            assert json.loads(process.stdout.readline())['ready']
            for iteration in range(100):
                process.stdin.write(json.dumps({'args': ['-c', 'alias.slow=!sleep 1', 'slow'],
                    'timeout': 10, 'cwd': directory, 'env': dict(os.environ)}) + '\n')
                process.stdin.flush()
                result = json.loads(process.stdout.readline())
                assert result.get('code') == 124, (worker, iteration, result)
            print('PASS worker', worker, '100 real Git timeouts', flush=True)
        finally:
            process.stdin.close()
            process.wait(timeout=5)

with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    list(pool.map(exercise, range(8)))
print('PASS: 800 timeouts, 0 helper errors')
