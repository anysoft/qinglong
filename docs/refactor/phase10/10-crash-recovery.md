# Phase 10 — 崩溃恢复

恢复扫描 RESOLVING / RUNNING / RECOVERY_REQUIRED；QUEUED 保持原样。恢复者必须先获得 Run owner EX，再获得 Worktree EX，并重新校验当前数据库状态/owner token。

复用 ConfigMaterialization journal 恢复原文件，再验证 Node binding journal。只有已知身份可清理；用户创建或替换的文件保留，run 为 RECOVERY_REQUIRED。成功恢复后未完成 Attempt 与 Run 标记 INTERRUPTED，不重试旧进程。

SIGKILL 验收启动真正独立 Backend worker，MAIN 再生长驻子孙进程；杀 worker 后验证 owner lock 继承、子孙退出、Config 原值恢复及队列保留。没有 PID reuse 杀进程路径。

Linux 专属 flock / process-group / crond 实机 gate 尚未执行，见 linux-step0.json；Darwin 通过不等价于 Linux PASS。
