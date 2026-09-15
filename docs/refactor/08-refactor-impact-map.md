# Refactor Impact Map（评估，不实施）

> Phase 0 历史快照：本文记录重构前基线。当前代码已新增 GitCredential / Repository、可空订阅引用及兼容适配器；现状增量、测试和限制见 [Phase 1 报告](../../PHASE1_REPORT.md)。旧执行管线保持基线行为。

风险是架构变更评估，不是GitNexus返回值；MCP不可用，不能声称已完成其impact调用。

| Future Feature | Backend | DB | Frontend | Executor | Filesystem | Risk |
|---|---|---|---|---|---|---|
| Git Credential | Subscription.formatUrl、SshKeyService、Open权限 | 独立credential引用/旧JSON迁移 | 订阅弹窗+设置 | Git env/argv脱敏 | ssh.d/HOME include | High |
| Repository | SubscriptionService+新资源Service/API | 稳定repo identity，不以alias当ID | 订阅来源关联 | 保留ql repo兼容 | clone roots / legacy scripts | High |
| Worktree | Git存储与检出管理/锁 | repo-worktree关系 | branch/workspace选择 | cwd/script定位 | bare objects vs worktree vs scripts | Critical |
| Global/Repo ENV | EnvService编译器+scope授权 | scoped key及排序 | 环境列表/继承展示 | 执行快照合并 | preload物化 | High |
| Task ENV | CronService、ENV授权 | task绑定/覆盖关系 | task编辑 | 不污染父环境 | 私有env snapshot | High |
| Config Asset | 保留Config API适配，新资源 | 内容版本/secret/绑定 | 文件编辑+引用 | 挂载/复制时机 | 避免直接覆盖全局config.sh | High |
| Hooks四阶段 | Cron/Subscription adapters | 可复用hook与phase | 编辑/绑定 | exit/cancel/finally语义、cwd/env | hook文件/日志 | High |
| Python runtime/pyenv | Provider+安装任务 | version/runtime记录 | 版本管理 | 显式executable | managed版本目录/cache | High |
| Python venv/reusable | 依赖Service+runtime lease | env identity/lock/包清单 | 依赖可视化 | PYTHONPATH/preload/activate兼容 | per-repo/shared venv | High |
| Python shared packages/pip cache | installer/cache policy | source/version/provenance | cache/包使用者 | 避免版本覆盖 | cache和已安装包分开 | High |
| Node runtime | Provider+token/backend边界 | runtime版本 | runtime选择 | node/ts-node/ESM preload | managed Node + PNPM_HOME | High |
| Node独立依赖 | dependency Service | project/env binding | 项目依赖界面 | global-first解析兼容 | node_modules/store | High |
| Task显式绑定 | CronService/API validation | repo/worktree/runtime/env/hook/config引用 | cron modal | snapshot resolve | cwd/log identity | Critical |
| 统一自动/手工模型 | scanner + CronService ownership | 现有同表，需discovery origin identity | ownership/override展示 | 保持makeCommand输出 | 自动删除与手工文件边界 | High |
| Execution Resolver | 收拢manual/gRPC/crond/ql入口 | execution snapshot/history | 状态与实例追踪 | 队列/exit/stop/timeout/hooks重接 | log/preload/worktree/runtime资源lease | Critical |
| Logs/Notifications兼容适配 | logReader、SockJS、NotificationService | instances/stats关联 | 保持log/通知界面 | stream drain和退出上报 | 旧log路径与retention | Medium |

## 推荐 Phase 1 Entry Point：Git Credential + Repository

1. 先在 `back/config/subscription.ts:formatUrl/formatCommand` 周边定义纯解析边界，并由现有输出 characterization 锁定兼容；不要此时切换 update_repo 算法。
2. Model 从现有 `back/data/subscription.ts:pull_option/url/branch/alias` 和 Auths.systemConfig.globalSshKey 映射到新资源；先定义引用与迁移回退，不删除旧字段。
3. Service 在 `SubscriptionService.handleTask/runSingle/setSshConfig` 与 `SshKeyService` 接口处接适配；凭证值不再进入应用日志，SSH文件生命周期应有独立所有者。
4. API 沿 `back/api/subscription.ts` / `back/api/index.ts` 扩展资源，保持旧请求响应与 `/open` scope语义；新增资源权限需明确，不能默认给所有App。
5. Frontend 从 `src/pages/subscription/modal.tsx` 旧credential输入/alias算法开始兼容；Repo选择器是后续新增，当前UI不动。
6. Filesystem 先建立稳定Repo ID到legacy uniq_path的映射与冲突检测，记录真实scripts副本；先备份再迁移。Bare/Worktree属于后续阶段。
7. Gate：通过既有测试+Phase0测试，并补公网替代的fake SSH/HTTP、数据迁移恢复、alias冲突与权限测试。严重缺陷单独决策，不在本阶段夹带修复。
