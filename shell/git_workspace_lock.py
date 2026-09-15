#!/usr/bin/env python3
"""Internal POSIX lock owner. JSON pipe protocol; never called by public ql CLI.
Locks remain held until a Git child is reaped, including controller disconnect.
"""
import fcntl, json, os, selectors, signal, subprocess, sys, time

closing = False
buffer = b''
fds = []
def stop(*_):
    global closing
    closing = True
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
def emit(value):
    try:
        sys.stdout.write(json.dumps(value) + '\n'); sys.stdout.flush()
    except BrokenPipeError:
        stop()
def message():
    global buffer
    while not closing:
        if b'\n' in buffer:
            line, buffer = buffer.split(b'\n', 1)
            return json.loads(line)
        ready, _, _ = __import__('select').select([sys.stdin], [], [], 0.2)
        if ready:
            data = os.read(sys.stdin.fileno(), 65536)
            if not data:
                stop(); break
            buffer += data
    return None

def run(request):
    child = None
    try:
        program = {'git': 'git', 'bash': '/bin/bash'}[request.get('program', 'git')]
        child = subprocess.Popen([program] + request['args'], cwd=request['cwd'], env=request['env'],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 start_new_session=True, pass_fds=tuple(fds))
        selector = selectors.DefaultSelector()
        selector.register(child.stdout, selectors.EVENT_READ, 'stdout')
        selector.register(child.stderr, selectors.EVENT_READ, 'stderr')
        selector.register(sys.stdin, selectors.EVENT_READ, 'controller')
        output = {'stdout': bytearray(), 'stderr': bytearray()}
        deadline = time.monotonic() + min(max(request.get('timeout', 30000)/1000, .01), 1800)
        code = None; overflow = False
        while selector.get_map() and not closing:
            if time.monotonic() >= deadline:
                code = 124; break
            for key, _ in selector.select(.1):
                if key.data == 'controller':
                    # Protocol is sequential. EOF means the controlling Node process died.
                    if not os.read(sys.stdin.fileno(), 65536): stop()
                    else: stop()  # cancellation/release during a running operation
                    continue
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk: selector.unregister(key.fileobj)
                elif not overflow:
                    output[key.data].extend(chunk)
                    if sum(map(len, output.values())) > 4*1024*1024:
                        overflow=True; output={'stdout':bytearray(),'stderr':bytearray()}; code=125; break
            if overflow or (child.poll() is not None and len(selector.get_map()) == 1): break
        if closing or code is not None:
            try: os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError: pass
        result = child.wait()
        selector.close()
        return {'code':code if code is not None else result,
                'stdout':output['stdout'].decode('utf-8','replace'),
                'stderr': 'Git output limit exceeded' if overflow else output['stderr'].decode('utf-8','replace')}
    finally:
        if child:
            # Reap any descendants before releasing advisory locks.
            try: os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError: pass
            child.wait()

try:
    paths = json.loads(sys.argv[1]); metadata = json.loads(sys.argv[2])
    for name in paths:
        fd = os.open(name, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        fds.append(fd)
        try: fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            try: detail=json.loads(os.read(fd,65536))
            except Exception: detail=None
            emit({'busy':True,'path':name,'owner':detail});sys.exit(0)
    if metadata.get('probe'):
        emit({'busy':False});sys.exit(0)
    metadata.update({'pid':os.getpid(),'controller_pid':os.getppid(),'started_at':time.time()})
    for fd in fds:
        os.ftruncate(fd,0);os.lseek(fd,0,os.SEEK_SET);os.write(fd,json.dumps(metadata).encode())
    emit({'ready':True,'owner':metadata})
    while not closing:
        request=message()
        if not request or request.get('release'):break
        emit(run(request))
except Exception:
    emit({'error':'WORKSPACE_HELPER_FAILED'})
finally:
    for fd in fds:os.close(fd)
