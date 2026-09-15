# 锁顺序与一致性

复用 Phase 2 `WorkspaceLocks` 和 Python POSIX flock helper，仅扩展资源名 subscription / publication，以及同一受监督进程入口的 Bash 类型。

```text
Subscription(id)
  → Repository(id)
    → Worktree(id)
      → Publication(1)
        → 原 Scheduler mutation lock
```

初始化、fetch、ensure 各自使用原仓库锁。随后 `withSync` 同时持有 Repository 与 Worktree 锁直到发现、复制、Cron 发布结束；相同仓库的其他变更在此期间报告 busy。最后的全局 publication 锁串行化 scripts 发布，不是新队列。批量删除订阅按 ID 升序获取订阅锁。

互斥覆盖同订阅重复运行、同工作区更新/删除、修改绑定和切换模式；共享分支不会在扫描过程中被另一个受管操作修改。暂存完成后再次确认工作区仍 clean 且 HEAD 未变化。直接在磁盘编辑的外部程序不遵守锁，不能宣称对任意外部写入具备文件系统快照隔离。

Bash 扫描器由原 helper 启动，继承锁描述符；超时或控制连接关闭时杀死进程组并回收子进程。新增 Bash 超时/重试测试与 Phase 2 跨进程、崩溃和 Git 超时测试共同覆盖释放路径。

Task 仍不获取 Worktree lease。没有修改调度器、队列、Task 运行 cwd 或执行器。
