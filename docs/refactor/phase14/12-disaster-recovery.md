# Disaster recovery runbook

1. 平台运行时从设置「备份与恢复」创建并验证 READY snapshot。
2. 加密导出并妥善保存口令；本地 snapshot 是私有敏感明文，不是离线可分发文件。
3. 在目标机器安装相同或支持该 schema 的应用，设置 QL_DIR、QL_DATA_DIR、可选 BACKUP_DIR。目标父目录必须可用，拒绝 symlink 根。
4. 停止后端。通过 CLI import/stage/apply，或 Panel stage 后重启。CLI 和启动应用均取得 backend.lock。
5. 检查 COMPLETE、历史 Run/log、Git dirty/local refs、Config 与 secrets 的使用能力。
6. 显式重建缺失托管资源，再验证 Python/Node Task readiness 与执行、Cron/Webhook/Git Trigger 和 Failure/Recovery notification。

```
node static/build/backupCli.js import /private/backup.platform-backup --passphrase-file /private/passphrase
node static/build/backupCli.js stage <import-id> --import
node static/build/backupCli.js apply
node static/build/backupCli.js status
```

口令也可通过 stdin；不要放命令参数。其他命令：list/create/validate/export/cancel/recover。输出仅静态错误/UUID/安全状态；文件位于所配置 BACKUP_DIR/exports。

遇到 RESTORE_RECOVERY_REQUIRED：保留 control/journal、candidate、quarantine、failed 和 backups，不重新初始化/删除数据来绕过。排除路径/ownership 冲突后 recover。Linux 资格验证属于 Phase 15。

`BACKUP_DIR` 应为单一平台实例的专用存储，不支持多个运行中的 DATA_DIR 共同管理同一备份目录。默认使用 DATA_DIR 的同级 `-backups` 目录；control 也在 DATA_DIR 外部。异地恢复可以使用不存在或已创建但为空的目标 DATA_DIR。空目标不制造虚假的 safety snapshot；其原目录仍保留于 quarantine。
