import json
import os

directory = os.environ.get('QL_TASK_ENV_SNAPSHOT')
snapshot = None
if directory:
    with open(os.path.join(directory, 'snapshot.json'), encoding='utf-8') as source:
        snapshot = json.load(source)


def apply_scoped_environment():
    if snapshot is None:
        return
    for name in snapshot['unset']:
        os.environ.pop(name, None)
    os.environ.update(snapshot['overlay'])
