# Crash / Dedup Recovery

1. Cron 事件落库与游标推进原子提交；崩溃回滚则下次重新选中。
2. 事件落库后提交前崩溃：启动恢复扫描 RECEIVED/PROCESSING。
3. TaskRun 创建与 Event link 使用 ExecutionService.submit 内同一 IMMEDIATE 事务；SIGKILL 发生在中间则完整回滚。
4. 提交已经 commit、响应或再次分发前崩溃：TaskRuns.submission_key 唯一身份找到原 Run，修复链接而不新建。

实际 SIGKILL 子进程测试覆盖 before-link 和 after-commit。事件层不实现运行失败重试；TaskRun 的 attempt policy 仍是唯一执行重试策略。历史记录删除引用变空后，未提交事件安全 SKIP。

两个实际进程竞争同一事件的测试确认仅产生一个 Event/TaskRun；不是仅靠单进程 Promise 并发模拟。
