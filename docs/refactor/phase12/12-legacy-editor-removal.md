# Legacy editor removal audit

| Consumer | 处置 |
|---|---|
| src/pages/script 原通用目录编辑器 | 退出正常导航；旧路径只显示 Code Workspace 引导 |
| api/script | 全部操作410 CODE_WORKSPACE_REQUIRED，在任何文件访问前拒绝 |
| ScriptService getFile/checkFilePath/runScript/stopScript | 退场；旧编辑服务无正常消费者 |
| api/script → data/bak | 不再产生每次编辑副本，原有用户bak文件保留并继续被完整快照覆盖 |
| ManagedSubscription stage/publication | Phase11已删除，不恢复staging消费者 |
| Execution/Discovery | 已使用正式Worktree，不依赖scripts |
| B13 SDK / bootstrap / Linux诊断材料 | 保留其独立历史职责，不借编辑器替换删除 |
| B14 LogService/API/retention | 保留系统/订阅/历史日志职责，不作为Editor入口 |

B01 的编辑器职责已退出，物理 scripts/bak 目录不删除、不自动迁移。源码根 scripts/ 构建工具不属于data/scripts。后续 Linux 清理仍须以各桥当前消费者与实际资格验证为准。
