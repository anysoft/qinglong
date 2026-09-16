# Runtime reconciliation and explicit rebuild

便携快照保留 RuntimeProvider/Installation、Python/Node Environment、Revision/Build、lockfile、Task binding 的数据库定义，排除经平台 ownership 分类的物理资源。未知 runtime 文件或未解决 quarantine 导致 BACKUP_RECOVERY_REQUIRED，不删除或静默忽略。

Restore 使用现有 domain 状态：Python Provider/全部 Installation MISSING（Node Provider 是逻辑目录元数据，保留其状态），Toolchain ERROR，Build health MISSING，Environment ERROR；保留历史 Build、current reference、immutable resolved/lock data。current 指向缺失 Build 不等于 READY。

为环境根重新创建正式 owner marker，原 inode sidecar 不恢复。API/UI 返回仅含 ID/version 的 missing resource plan。`POST /restore/rebuild` 显式调用 RuntimeOperationService：Python provider/runtime → Node runtime/toolchain → Python/Node env build/rebuild。安装器只允许 missing/removed 或明确 restore-rebuild 标记的记录重建，并继续拒绝占用的未知物理目录。

Restore 本身不访问 Git/PyPI/Node/npm；重建是之后独立的在线操作。没有系统 Python/Node fallback。部分重建失败保留成功资源与失败状态；缺失/错误资源仍显示在计划中，不能误报重建成功。失败资源按正式 Runtime/Environment 管理界面诊断、修复后再执行重建，未承诺自动重试所有安装器故障。
