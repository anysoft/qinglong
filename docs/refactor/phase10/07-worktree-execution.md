# Phase 10 — 直接 Worktree 执行

入口来自 TaskSource 的 Worktree ID 与相对路径，规范根由 RepositoryPathResolver 生成，数据库 local_path 必须匹配。禁止使用 scripts staging 副本推导执行源。

Worktree 独占租约贯穿 resolve、PREPARE、Hooks、MAIN、CLEANUP、retry backoff 和最终释放。更新、删除、切换不能与活跃运行并发修改同一 Worktree。ALLOW 表示领域允许多个 Run；同一 Worktree 的实际修改型材料化仍由独占租约串行。

FD 传入 Config/Node 安装 helper、Hook supervisor 与 MAIN supervisor。Backend 被 SIGKILL 时继承 FD 的 supervisor/后代仍阻止恢复抢锁；后代收敛之后其他控制器才能恢复。用户直接在文件系统修改文件不属于跨用户进程沙箱保证，检测到不明替换时必须保留并转 RECOVERY_REQUIRED。
