#!/usr/bin/env python3
"""Atomic no-replace publication preserving a symlink inode on Linux and macOS.
Node's fs.link follows the source symlink on macOS; POSIX linkat without
AT_SYMLINK_FOLLOW preserves the journaled inode. No asset/domain logic here.
"""
import os
import sys

try:
    os.link(sys.argv[1], sys.argv[2], follow_symlinks=False)
except OSError:
    sys.stderr.write('CONFIG_INSTALL_FAILED\n')
    sys.exit(1)
