# Lock Ordering / Recovery

锁顺序：Provider flock(EX, nonblocking) → 短 DB transaction → Provider/runtime/cache filesystem → 短 DB transaction → 清理 → close lease。一个 Provider 的所有写操作和 Verify/Catalog Refresh 保守串行，冲突返回 RUNTIME_BUSY，不在内存排队。列表读取不拿写锁。

.lock 文件稳定 inode，Node 打开并将 FD3 交给 runtime_lease.py 获得 flock；共享 open-file description 由 Node 持有，并传给 POSIX supervisor/编译进程。Backend 死亡时仍运行的子进程持有锁，不能被另一个 Backend 接管。不得删除锁文件。

恢复只查询 QUEUED/RUNNING，对相应 Provider 尝试锁：busy 保留操作；成功说明无活跃租约，事务标记 INTERRUPTED、资源 ERROR。启动不 fetch/build/执行每个 Python；随后每秒只检查未完成操作。UI 显示 obvious MISSING/INVALID/ORPHAN，用户显式 Verify/Repair/Remove 处理。

恢复不使用 kill(pid,0) 决定所有权，不按旧 PID 发信号，无 PID reuse 风险。多个 Backend 互斥由 OS flock 保证。

Runtime 不获取 B17、Config、Worktree、Task execution lease，不使用 ExecutionPreparation。仅复用通用 process_group.py / hook_process.py 的进程监督实现，现有 Hook 生命周期完全不变。
