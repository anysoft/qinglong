import errno
import importlib.util
import os
import signal
import subprocess
import sys
import time
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('owned_group', sys.argv[1])
groups = importlib.util.module_from_spec(spec)
spec.loader.exec_module(groups)

# Deterministically exercise the exceptional path on Linux CI too.
with patch.object(groups.sys, 'platform', 'darwin'), patch.object(groups.os, 'killpg', side_effect=PermissionError(errno.EPERM, 'fixture')):
    for output in (b'44 Z\n45 S\n', b'45 R\n'):
        with patch.object(groups.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, output)):
            groups.signal_group(44, signal.SIGKILL)
    for output in (b'44 R\n', b'44 S\n', b'invalid\n'):
        with patch.object(groups.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, output)):
            try:
                groups.signal_group(44, signal.SIGKILL)
            except PermissionError:
                pass
            else:
                raise AssertionError('must preserve failure for live/unknown group')
    with patch.object(groups.subprocess, 'run', side_effect=subprocess.TimeoutExpired('ps', 2)):
        try:
            groups.signal_group(44, signal.SIGKILL)
        except PermissionError:
            pass
        else:
            raise AssertionError('inspection failure must fail closed')
with patch.object(groups.sys, 'platform', 'linux'), patch.object(groups.os, 'killpg', side_effect=PermissionError(errno.EPERM, 'fixture')):
    try:
        groups.signal_group(44, signal.SIGKILL)
    except PermissionError:
        pass
    else:
        raise AssertionError('Linux permissions must not be ignored')
for invalid in (0, 1, -1, True):
    try:
        groups.signal_group(invalid, signal.SIGKILL)
    except ValueError:
        pass
    else:
        raise AssertionError('invalid group')

# Real zombie group: intentionally keep the leader unreaped until signalling.
read_fd, write_fd = os.pipe()
pid = os.fork()
if pid == 0:
    os.close(read_fd)
    os.setsid()
    os.write(write_fd, b'R')
    os._exit(0)
os.close(write_fd)
try:
    assert os.read(read_fd, 1) == b'R'
    deadline = time.monotonic() + 5
    while True:
        state = subprocess.check_output(['/bin/ps', '-o', 'stat=', '-p', str(pid)]).decode().strip()
        if state.startswith('Z'):
            break
        assert time.monotonic() < deadline
        time.sleep(.01)
    groups.signal_group(pid, signal.SIGKILL)
finally:
    os.close(read_fd)
    os.waitpid(pid, 0)
print('PASS: Darwin zombie-only EPERM, live/unknown refusal, real zombie group')
