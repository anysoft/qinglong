# Backup / restore integration

Workspace 直接修改已由 Phase14 快照覆盖的 Worktree 和 bare refs/index；无需新增备份组件或 schema。dirty tracked、untracked、local-only commit、mode 均是用户数据，不视为可重建 cache。作者设置随既有 SQLite 备份保存。

服务与HTTP两层 mutation lifetime 复用 Phase14 shared/exclusive barrier；Backup 等待已开始编辑操作排空，QUIESCING 拒绝新写入。RESTORE_PENDING 阻止包括 Commit/Push 在内的 Workspace mutation。

跨 DATA 根恢复仍由 BackupRestoreGitRepairService 按 Repository/Worktree ID 修复 registration；Workspace 重新通过 canonical resolver 校验，不沿旧绝对路径读取。保留Phase14原有日志、通知、Runtime reconcile、journal/safety snapshot职责。

验证证据以 Phase12 最终报告和 diagnostics 为准；Phase14 历史 PASS 不替代本轮 Workspace 集成测试。
