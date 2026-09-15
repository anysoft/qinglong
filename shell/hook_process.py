#!/usr/bin/env python3
"""Thin process-group supervisor, matching git_workspace_lock's POSIX approach.
stdout/stderr stay streaming pipes consumed by observeChildProcess. The parent
keeps stdin open; EOF terminates/reaps the process group before releasing lease FDs.
"""
import os
import select
import signal
import subprocess
import sys
import time

# Isolated Python ignores PYTHONPATH; only import our installed helper directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_group import signal_group

interrupted = False

def stop(*_):
    global interrupted
    interrupted = True

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
child = None
try:
    timeout = float(sys.argv[1])
    fds = tuple(int(x) for x in os.environ.get('PLATFORM_LEASE_FDS', '').split(',') if x)
    child = subprocess.Popen(sys.argv[2:], stdin=subprocess.DEVNULL, stdout=sys.stdout, stderr=sys.stderr,
                             start_new_session=True, pass_fds=fds)
    deadline = time.monotonic() + timeout if timeout > 0 else float('inf')
    result = None
    while child.poll() is None:
        readable, _, _ = select.select([sys.stdin], [], [], .05)
        if readable and not os.read(sys.stdin.fileno(), 1):
            interrupted = True
        if interrupted or time.monotonic() >= deadline:
            result = 143 if interrupted else 124
            try:
                signal_group(child.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            end = time.monotonic() + 2
            while child.poll() is None and time.monotonic() < end:
                time.sleep(.02)
            break
    # Reap background descendants too; they must not outlive a hook phase/lease.
    try:
        signal_group(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    code = child.wait()
    sys.exit(result if result is not None else code if code >= 0 else 128 - code)
except Exception:
    sys.stderr.write('TASK_PROCESS_FAILED\n')
    sys.exit(1)
finally:
    if child is not None:
        try:
            signal_group(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()
