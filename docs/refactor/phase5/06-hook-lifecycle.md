# 生命周期与结果

| 情况 | 后续行为 |
| --- | --- |
| PREPARE 失败 | 不开始用户 Hook/MAIN；平台清理已取得资源 |
| BEFORE FAIL_EXECUTION 失败 | 停止剩余 BEFORE，跳过 MAIN，AFTER_FAILURE → FINALLY |
| BEFORE CONTINUE 失败 | 记录详情，继续后续 BEFORE 与 MAIN |
| MAIN 成功 | AFTER_SUCCESS → FINALLY |
| MAIN 非零、超时、优雅取消 | AFTER_FAILURE → FINALLY |
| AFTER_SUCCESS 失败 | 根据策略改变结果，继续该阶段其余 Hook，不跳转 AFTER_FAILURE |
| AFTER_FAILURE/FINALLY 失败 | 追加详情，不覆盖已有 primary failure |
| 成功后 FINALLY FAIL_EXECUTION 失败 | 整体失败 |

AFTER/FINALLY 尝试全部启用 Hook；failure_policy 控制整体结果。首个致命错误保留为 primary，后续 failure 追加记录；CONTINUE 错误不单独使整体失败。CLEANUP 最后执行，清理失败使执行失败并保留恢复证据。

HookExecutor 使用已有 UTF-8/backpressure/drain 观察器；POSIX 监督进程处理 deadline、TERM、KILL、进程组和父管道 EOF。MAIN 仍是 task.sh → otask.sh：语言选择、cwd、参数、账号模式、SDK/依赖和状态回环继续保留。未建立 Runner v2 或 TaskRun 表。

手工、Node scheduler、system crond 的 Task command 都经 makeCommand/task.sh；包括旧 ql 开头的 Task 命令。内部平台运维本身继续由 B12 持有。

POSIX supervisor 通过 process_group helper 处理 macOS 的 zombie-only killpg EPERM：只在固定 PGID/state 检查确认没有活进程后视为清理完成；真实权限错误及无法验证的状态仍失败。Git 与 Hook 使用同一处理，避免超时结果被已退出进程组的二次清理误报覆盖。
