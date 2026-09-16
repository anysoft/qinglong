# Backup Coordinator

生产入口是 Panel `/api/backups` 和离线 `static/build/backupCli.js create`。两者使用同一个 BackupCoordinator，复用 Phase 14 的 SQLite、archive、envelope 和 FD barrier。

在线创建：请求 QUIESCING → 排空已接收的 TaskRuns/RuntimeOperations → 等待 Repository/Worktree critical sections 与 SENDING delivery → 独占 mutation lease → 检查恢复日志 → 复制组件 → SQLite VACUUM INTO → domain/Git/checksum 验证 → 原子发布。默认等待 600 秒，上限 3600 秒，超时 BACKUP_BUSY 并恢复接收写入。

READY 只对经过完整验证的 snapshot 发布。失败目录留在 `.staging` 且不出现在备份列表。清理必须核对 `.owner.json` 的 UUID、dev、ino，不能按目录名称猜测归属。未知内容保留。

BackupOperations 使用独立 FD 排他锁串行化 create/export/import/stage/delete/rebuild；任务状态使用私有 JSON，重启将遗留 QUEUED/RUNNING 标为 FAILED / BACKUP_OPERATION_INTERRUPTED。进度为已处理文件数和字节数，不推算百分比。
