# Offline restore architecture

Panel 只 validate/stage/cancel/status，不能在线覆盖 DATA_DIR。stage 要求显式输入 RESTORE；在独占 backup barrier 内写 journal + RESTORE_PENDING，停止后续业务 mutation。

Application primary 先取得 backend.lock，再执行 RestoreService.apply，之后才正常 SQLite bootstrap/fork workers。CLI apply 同样必须取得 backend.lock；运行中平台或继承租约的进程仍存活时拒绝应用。

Candidate 位于外置 control/candidates，先复制验证过的 snapshot/data，再用 canonical initializeOperationalSchema 迁移；不启动 scheduler/runner。Git repair、RuntimeRestoreReconciler、DB/Config 验证与文件 mode 恢复完成后，为已有 DATA_DIR 创建 safety snapshot。

同文件系统 rename：live → quarantine，candidate → live。完成最终 Git/DB 验证才 COMPLETE。验证失败则将 candidate 留在 failed 并恢复旧根；未知 inode/path 冲突保留现场并 RESTORE_RECOVERY_REQUIRED。绝不自动永久删除 pre-restore data。
