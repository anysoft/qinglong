# Task Hooks v2

`TaskHooks` 以 Task ID 引用当前 Crontabs bridge。字段：name、phase、command、cwd_base、position、timeout_seconds、failure_policy、enabled、version 和 timestamps。

四个固定阶段：BEFORE、AFTER_SUCCESS、AFTER_FAILURE、FINALLY。每阶段 `(task_id, phase, position)` 唯一，按 position/id 稳定执行。API 支持 CRUD、启停和事务 reorder；UI 使用数字 Order。修改需 expected_version，冲突拒绝。整个计划随执行准备固定，运行中修改只影响下一次。

Hook 是用户主动保存的可执行 POSIX shell 代码。平台不把 Secret ENV 插入 command 字符串。cwd 可选 TASK_CWD / WORKSPACE_ROOT。超时 1–3600 秒，command 最大 64 KiB。默认 BEFORE/AFTER_SUCCESS/FINALLY 为 FAIL_EXECUTION，AFTER_FAILURE 为 CONTINUE。
