#!/usr/bin/env python3
"""POSIX execution lease launcher. No binding/ENV/Hook domain logic lives here.
Descriptors pass through the lifecycle and its supervised children, so a controller
crash never releases a lease while a child still uses the materialized workspace.
"""
import fcntl
import json
import os
import signal
import stat
import subprocess
import sys
import time

# Isolated Python ignores PYTHONPATH; only import our installed helper directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_group import signal_group

child = None
cancelled = False

def cancel(*_):
    global cancelled
    cancelled = True
    if child is not None:
        try:
            child.send_signal(signal.SIGTERM)
        except ProcessLookupError:
            pass

signal.signal(signal.SIGTERM, cancel)
signal.signal(signal.SIGINT, cancel)
fds = []
try:
    resources = json.loads(sys.argv[1])
    for resource in resources:
        fd = os.open(resource['path'], os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        fds.append(fd)
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('unsafe lock')
        try:
            fcntl.flock(fd, (fcntl.LOCK_EX if resource['exclusive'] else fcntl.LOCK_SH) | fcntl.LOCK_NB)
        except BlockingIOError:
            sys.stderr.write('CONFIG_WORKSPACE_BUSY\n')
            sys.exit(75)
    environment = dict(os.environ)
    environment['PLATFORM_LEASE_FDS'] = ','.join(map(str, fds))
    child = subprocess.Popen(sys.argv[2:], env=environment, pass_fds=tuple(fds), start_new_session=True)
    if cancelled:
        cancel()
    parent = os.getppid()
    orphan_deadline = None
    while child.poll() is None:
        if os.getppid() != parent and orphan_deadline is None:
            cancel()
            orphan_deadline = time.monotonic() + 10
        if orphan_deadline is not None and time.monotonic() >= orphan_deadline:
            try:
                signal_group(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        time.sleep(.05)
    sys.exit(child.returncode if child.returncode >= 0 else 128 - child.returncode)
except Exception:
    sys.stderr.write('CONFIG_LEASE_FAILED\n')
    sys.exit(1)
finally:
    if child is not None and child.poll() is None:
        try:
            signal_group(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()
    for fd in fds:
        os.close(fd)
