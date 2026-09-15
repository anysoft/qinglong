import os
import re
import builtins
import sys
import scoped_env
scoped_env.apply_scoped_environment()
import signal
from client import Client


def try_parse_int(value):
    try:
        return int(value)
    except ValueError:
        return None


def expand_range(range_str, max_value):
    temp_range_str = (
        range_str.strip()
        .replace("-max", f"-{max_value}")
        .replace("max-", f"{max_value}-")
    )

    result = []
    for part in temp_range_str.split(" "):
        range_match = re.match(r"^(\d+)([-~_])(\d+)$", part)
        if range_match:
            start, _, end = map(try_parse_int, range_match.groups())
            step = 1 if start < end else -1
            result.extend(range(start, end + step, step))
        else:
            result.append(int(part))

    return result


def run():
    os.environ["PYTHONPATH"] = os.getenv("PREV_PYTHONPATH", "")

    env_param = os.getenv("envParam")
    num_param = os.getenv("numParam")

    if env_param and num_param:
        array = (os.getenv(env_param) or "").split("&")
        run_arr = expand_range(num_param, len(array))
        array_run = [array[i - 1] for i in run_arr if i - 1 < len(array) and i > 0]
        env_str = "&".join(array_run)
        os.environ[env_param] = env_str


def handle_sigterm(signum, frame):
    sys.exit(15)


try:
    signal.signal(signal.SIGTERM, handle_sigterm)

    run()

    from __ql_notify__ import send

    class BaseApi(Client):
        def notify(self, *args, **kwargs):
            return send(*args, **kwargs)

    QLAPI = BaseApi()
    builtins.QLAPI = QLAPI
except Exception as error:
    print(f"run builtin code error: {error}\n")
