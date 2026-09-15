#!/usr/bin/env python3
"""Acquire the Runtime Provider lease on the Node-owned open file description.
The controller retains FD3 and passes it to supervised build descendants.
"""
import fcntl
import os
import stat
import sys

try:
    if not stat.S_ISREG(os.fstat(3).st_mode):
        sys.exit(1)
    fcntl.flock(3, (fcntl.LOCK_SH if sys.argv[1:] == ['shared'] else fcntl.LOCK_EX) | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(75)
except OSError:
    sys.exit(1)
