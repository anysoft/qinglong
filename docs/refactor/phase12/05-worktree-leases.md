# Worktree leases

所有 Workspace mutation 先持 Phase14 platform mutation shared lease，再经 RepositoryStorage.withRepository（传入当前 Worktree ID） 获取 Repository/Worktree 原有 EX inode，验证注册后执行。没有新 editor.lock。文件、stage、unstage、commit、push 的服务入口使用 PlatformMutation；全局 Git identity 设置只修改 System Settings，也持 platform shared lease；HTTP handler 另有既有生命周期保护，客户端断连不会提前释放正在执行的 mutation。

Execution/GitSync/另一编辑操作占用时拒绝。Repository 层竞争可返回 REPOSITORY_BUSY，Worktree 层返回 WORKTREE_BUSY。文件读取也采取保守 EX lease 策略，避免与 Secret Config materialization 并发。

WorkspaceLocks 的 Git supervisor 继承当前平台/backend FD，并将它们与 Worktree FD 传给 Git 和固定 rename helper；控制器退出时监督器收敛子进程后才释放。沿用既有锁顺序与回收职责。

Backup QUIESCING 拒绝新 editor mutation，已接收操作持 shared FD 完成后快照才获得排他锁。RESTORE_PENDING 拒绝 Save/Create/Delete/Commit/Push，不通过直接 service 入口绕过。
