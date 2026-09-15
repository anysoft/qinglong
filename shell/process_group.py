"""Signal an owned POSIX child group, handling Darwin's zombie-only EPERM.

XNU filters zombies from killpg's group walk and can then return EPERM. Never
ignore a permission error for a live group. The fallback reads only PGID/state,
never command arguments or environment, and fails closed if inspection fails.
"""
import os
import subprocess
import sys


def signal_group(pgid, signum):
    if not isinstance(pgid, int) or isinstance(pgid, bool) or pgid <= 1:
        raise ValueError('invalid process group')
    try:
        os.killpg(pgid, signum)
    except ProcessLookupError:
        return
    except PermissionError:
        if sys.platform != 'darwin':
            raise
        try:
            result = subprocess.run(
                ['/bin/ps', '-axo', 'pgid=,stat='],
                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL, check=True, timeout=2,
                env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'},
            )
            for row in result.stdout.decode('ascii').splitlines():
                group, state = row.split()
                if int(group) == pgid and not state.startswith('Z'):
                    raise ValueError('process group remains alive')
        except Exception:
            # No arbitrary command/error text escapes this low-level boundary.
            raise PermissionError('process group could not be terminated') from None
