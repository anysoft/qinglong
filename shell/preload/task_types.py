"""Phase 9 logical Task API types. No runtime paths or execution snapshots.

client.py's Cron DTOs describe the retained internal protobuf bridge only.
Use /api/tasks with a panel session for Task definitions; old IPC mutation
methods return TASK_API_REQUIRED. Managed runtime execution starts in Phase 10.
"""
from typing import List, Literal, Optional, TypedDict


class TaskSource(TypedDict):
    type: Literal['WORKTREE_ENTRYPOINT']
    worktree_id: int
    relative_entrypoint: str
    language: Literal['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'SHELL']
    cwd_mode: Literal['WORKTREE_ROOT', 'ENTRYPOINT_DIR', 'CUSTOM_RELATIVE']
    cwd_relative_path: Optional[str]


class TaskRuntimeBinding(TypedDict):
    kind: Literal['SHELL', 'PYTHON', 'NODE']
    python_environment_id: Optional[int]
    node_environment_id: Optional[int]


class TaskExecutionSettings(TypedDict):
    timeout_seconds: Optional[int]
    max_attempts: int
    initial_delay_seconds: int
    backoff: Literal['FIXED', 'EXPONENTIAL']
    concurrency: Literal['FORBID', 'QUEUE', 'ALLOW']
    notification: Literal['NONE', 'FAILURE', 'SUCCESS', 'ALWAYS']


class Task(TypedDict):
    id: int
    name: str
    description: str
    enabled: bool
    origin: Literal['MANUAL', 'DISCOVERED']
    subscription_id: Optional[int]
    discovery_key: Optional[str]
    env_profile_id: Optional[int]
    arguments: List[str]
    schedule: Optional[str]
    version: int
    source: Optional[TaskSource]
    runtime: Optional[TaskRuntimeBinding]
    settings: TaskExecutionSettings
