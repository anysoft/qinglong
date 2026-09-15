# Runtime Operations

API POST/DELETE 在创建操作记录后返回 HTTP 202 + {code:200,data:{id,...}}。编译不占用长 HTTP 响应。

Types：PROVIDER_INSTALL/UPDATE/VERIFY/REPAIR、CATALOG_REFRESH、RUNTIME_INSTALL/VERIFY/REMOVE/REPAIR。状态 QUEUED → RUNNING → SUCCESS/FAILED/CANCELLED，崩溃变 INTERRUPTED。Stage 为 PREPARING/FETCHING_PROVIDER/BUILDING/VERIFYING/REMOVING/REPAIRING 等真实阶段，没有伪造百分比。

operation_timeout 默认 3600 秒，范围 1..7200；jobs 默认 4，范围 1..16。超时是整组命令共享 deadline。返回真实非零 command exit_code；timeout=124，cancel=143。数据库只存静态错误码和有限元数据，输出流在 log/runtime/runtime-operation-ID.log。

日志复用 UTF-8/backpressure/drain 与 ExecutionRedactor，最多约 16 MiB + 截断标记，API 读取末尾 64 KiB。超限后继续 drain；落盘失败终止进程。跨块脱敏 Backend secret/token/password/credential/private_key 值及私有 HOME。没有事件总线或 TaskRun 复用；UI 轮询状态/日志。

取消写 cancel_requested，所有者每 250ms 检查并向自己持有的 ChildProcess 发 TERM。Supervisor 向 process group TERM，2 秒后 KILL，wait/reap/drain 后释放租约。存储 PID 不用于发信号。

临时目录清理失败留下 CLEANUP_REQUIRED / RUNTIME_CLEANUP_FAILED，保留未知内容；业务操作结果与清理诊断可分别检查。没有无条件递归恢复清理。
