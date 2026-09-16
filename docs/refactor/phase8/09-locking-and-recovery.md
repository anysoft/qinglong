# Locks 与 Recovery

资源顺序：Runtime SH → Toolchain SH → Environment EX → Build EX/SH。Runtime/Toolchain 修改要求 EX；Resolver 使用 Current Build SH pin。不同 Environment 可并行，跨进程 Node Build slot 上限 2；同 Environment 冲突返回 BUSY。Python Provider 与 Node Provider 不共享全局执行锁。

所有资源锁 FD 随固定 Process Supervisor 继承，包括 Python Environment 的既有锁；不能只让父进程持有 Runtime lock。TERM → grace → KILL 收敛整个进程组，supervisor 等待输出 drain，后端崩溃后锁仍由活跃子进程持有。

每个 Node Operation 有独立 operation lease。恢复器仅在取得 EX 后将遗留 RUNNING 标记 INTERRUPTED；不会在活跃旧 worker 仍持锁时抢占。新 Build 不改旧 Current；取消清理已验证所有权的本次目录。普通失败保留失败记录供诊断、显式删除/重试；不删除未知目录。

数据库删除先 DELETING，文件清理成功再 finalize。清理故障保留 ERROR，明确需要恢复。临时 definition 验证亦在 finally 释放所有资源锁，即使 tmp cleanup 抛错。
