#!/usr/bin/env python3
"""Fixed internal no-replace rename. No recursive copy or shell interpretation."""
import ctypes, errno, os, sys
libc = ctypes.CDLL(None, use_errno=True)
a, b = os.fsencode(sys.argv[1]), os.fsencode(sys.argv[2])
if sys.platform == 'darwin':
    fn = libc.renamex_np
    fn.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
    result = fn(a, b, 4)  # RENAME_EXCL
elif sys.platform.startswith('linux'):
    fn = libc.renameat2
    fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    result = fn(-100, a, -100, b, 1)  # RENAME_NOREPLACE
else:
    sys.exit(95)
sys.exit(ctypes.get_errno() if result else 0)
