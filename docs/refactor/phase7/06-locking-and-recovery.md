# Locks, cancellation and recovery

统一顺序：Provider EX → Environment mutation EX → Build lease。第一版 Provider 级保守串行，不允许任意数量重型包构建。Runtime install/verify/repair/remove、Provider update 与 Environment build 返回 BUSY 而非互相破坏。

RuntimeLease 扩展 shared 模式，默认仍为 EX；Node 持有稳定 lock inode 的 FD，现有 POSIX supervisor 继承 Provider FD。只要构建后代仍存活，另一 Backend 就不能取得 Provider EX 并删除资源。Environment FD 不另行传入子进程，Provider EX 已覆盖所有环境写路径；Resolver 的共享 Build FD 由调用方持有/释放，未来 Runner 必须传递该 FD。

取消复用 RuntimeOperation cancel_requested、250 ms 所有者轮询、实际 ChildProcess、TERM→grace→KILL→reap/drain。取消的 owned staging 会清理；未知/异常所有权不自动删除。故障保留文件和操作日志。启动只在取得 Provider EX 后将未完成环境操作/Build 标 INTERRUPTED，并恢复 Environment 状态为旧健康 Current 或 ERROR。不会将存在的目录自动当作 READY，不依靠存储 PID 发信号。

删除：取得全部相关 Build EX leases → DELETING → 验证 ownership/dev/ino → 文件系统删除 → DB 去指针/删 Builds/Revisions/Environment。部分失败可重试；外部 sidecar 支持目录已删但 metadata 尚存的恢复。未知目录/文件报告 ORPHAN，不清空或接管。
