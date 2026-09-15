# 注入、锁与恢复

每次注入先取得跨进程 POSIX flock。相同逻辑 workspace：有配置或遗留 journal 的执行取得 EX，其他执行取得 SH；冲突返回 `CONFIG_WORKSPACE_BUSY`。不同 workspace 可并行。当前全部 Task 取得全局 `publication-1` SH，与已有 Git publication EX 协调，防止同步替换正在执行的目录。锁文件 inode 稳定，不 unlink 锁文件。

锁覆盖 PREPARE、四阶段 Hook、MAIN、FINALLY 和 CLEANUP。Python 仅承担 POSIX 锁/进程组监督，Hook 命令本身使用 `/bin/sh`；不引入 Python Runtime Manager。锁 FD 由监督链持有，控制进程崩溃后先终止子进程组，再释放最后一个引用。

COPY/SYMLINK 都先创建 run-private 副本，SYMLINK 仅指向该副本。只读为 0400，writable 为 0600。默认 FAIL_IF_EXISTS；REPLACE_RESTORE 仅接受 regular file，先持久化 journal，再把原文件原子移至私有 backup。原字节、inode、mode 和 checksum 用于恢复核对。

安装通过同文件系统的 exclusive hard-link 发布临时 inode，再移除临时名，避免检查后另一个文件出现时被 rename 覆盖。恢复同样不覆盖未知 target。每层父路径都 lstat 检查并验证边界，拒绝 symlink target/parent、special file、`.git`、内部路径。

Journal 位于 `data/tmp/config-materialization/<resourceKey>/run-UUID/`。下次取得独占锁时回放；共享锁取得后再次检查 journal，若发现竞态遗留则退回控制器重新取独占锁。恢复可重复；陌生 target、损坏 backup 或不可信 journal 返回 `CONFIG_RECOVERY_REQUIRED`，保留资料供诊断，不删除用户文件。目录创建可能保留空目录，清理不递归删除 workspace 用户目录。

正常失败、超时与优雅取消尝试用户 FINALLY。SIGKILL、断电、内核崩溃不能保证用户 FINALLY，只能依靠后续平台恢复。文件/目录 fsync 增强持久性；不宣称在任意损坏文件系统上无损恢复。

当前发布锁是全局保守锁，长任务可能使其他 Repository 的同步返回 BUSY；不同执行 workspace 之间仍可并行。Task 发布删除延后到文件和调度投影均成功，防止失败补偿阶段级联丢失 Task ENV、Config Bindings 与 Hooks。
