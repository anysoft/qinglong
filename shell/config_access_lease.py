#!/usr/bin/env python3
"""Apply flock to an inherited open file description; the Node owner retains FD.
A successful helper exit does not release the lease while the owner holds its FD.
"""
import fcntl
import sys

try:
    fcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(75)
except OSError:
    sys.exit(1)
