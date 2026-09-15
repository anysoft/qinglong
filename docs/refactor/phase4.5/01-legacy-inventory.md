# Legacy / Compatibility / Bridge Inventory

审计对象为当前工作树（包含未提交 Phase 4），不是只审 HEAD。KEEP=保留能力与核心实现；REMOVE=删除目标，不表示本次已删或零前置条件；REPLACE=接替职责后删除；TEMPORARY_BRIDGE=当前运行必需且有退出条件；DEFER=后阶段设计。风险是架构评估；GitNexus 原始证据另存 diagnostics。

所有 Source Files 中 `file:symbol` 表示可定位符号，通配符表示模块集合；细节和行号见 diagnostics/phase4.5 各 JSON。

| Component | Source Files | Current Responsibility | Why It Exists | New Platform Still Needs It? | Classification | Replacement | Removal Preconditions | Risk | Recommended Phase |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Database | back/loaders/db.ts; back/shared/*Migration*.ts | 9 ORM sync + 21 migration ledger | 逐代扩展旧表 | 需要 DB，不需要旧升级链 | REPLACE | fresh bootstrap v1 | 空库启动/重启/失败回滚；不得重置已有非空库 | CRITICAL | 4.5B |
| Backend Models / Crontab | back/data/cron.ts | Task+Schedule+Runner 状态混合 | 旧 cron 中心模型 | 任务定义需要 | TEMPORARY_BRIDGE | Task/Schedule/TaskRun | 所有调度/状态/UI 调用切换 | HIGH | 9–10 |
| Backend Services / Cron | back/services/cron.ts | CRUD、发布、排队、状态、文件调度 | 现有可运行能力 | 暂需 | TEMPORARY_BRIDGE | TaskService + scheduler adapter + Runner | 不能只重命名或删类 | CRITICAL | 9–10 |
| GitCredential | back/data/gitCredential.ts; back/services/gitCredential*.ts; back/services/credentialSecret.ts | 隔离认证、凭据复用/脱敏 | Phase 1 新核心 | 是 | KEEP | 保留；Repository owns credential | 不删除 host 校验/secret 边界 | HIGH | 持续 |
| Repository | back/data/repository.ts; back/services/repository.ts | 稳定远端身份/元数据 | Phase 1 新核心 | 是 | KEEP | 去兼容 spelling 限制；合并重复删除入口 | ID identity 与去重/引用保护保留 | HIGH | 4.5B |
| Repository storage / Git runner | back/services/repositoryStorage.ts; back/services/gitCommand.ts; back/shared/workspacePaths.ts | bare、fetch、安全路径、恢复 | Phase 2 新核心 | 是 | KEEP | 保留 | 保护本地历史；不得因 fresh-only 移除恢复逻辑 | CRITICAL | 持续 |
| Worktree | back/data/worktree.ts; back/services/worktree.ts | 持久 workspace、FF/status/repair | 新平台代码工作区 | 是 | KEEP | 独立 Workspace，purpose 改创建来源 metadata | 引用与 lease 不按 purpose 自动删 | HIGH | 4.5B/9 |
| Locks / leases | back/services/workspaceLocks.ts; shell/git_workspace_lock.py | 跨进程互斥与进程组监督 | 数据完整性 | 是 | KEEP | 未来执行器接入 lease | Task 当前没有 lease，不能当无调用死代码 | CRITICAL | 10 集成 |
| Legacy Subscription mode | back/services/subscription.ts; back/gitSubscription.ts; back/config/subscription.ts | 手工 URL/raw/旧 clone 分流 | 兼容 QingLong | 否 | REMOVE | 唯一 Repository sync | API/UI/schema 同步移除模式；入口仍可调度 | HIGH | 4.5B |
| Managed Subscription | back/services/managedSubscription.ts | fetch/ensure/FF/stage/publish | Phase 3 新核心含桥 | 是 | KEEP | SubscriptionSyncService + 独立 Discovery adapter | 保留锁序/失败补偿；去 git_mode 不删业务 | HIGH | 4.5B |
| Subscription credential override | back/services/subscriptionGit.ts; back/data/subscription.ts | 覆盖仓库网络身份 | 原阶段复用需求 | 暂无代码证明必须按订阅不同身份 | REMOVE | Repository.default_credential_id | 所有 prepare/fetch/usage/API 同步；NULL anonymous 仍合法 | MEDIUM | 4.5B |
| URL conversion / collision | back/services/subscriptionGit.ts | 旧 URL 转资源、检查旧命名空间 | 迁移与 scripts 命名耦合 | conversion 不需要；碰撞暂需 | REPLACE | 删 convert；ID publication prefix 替换 legacyCheckoutName | Managed stage 仍调用旧命名；不能整文件删 | HIGH | 4.5B |
| Legacy Git acquisition | shell/update.sh:update_repo/update_raw; shell/share.sh:git_clone_scripts | rm+clone/raw 下载 | 旧 source 实现 | 否 | REMOVE | RepositoryStorageService | 先移除 bot clone 调用；保留共享 discovery 函数 | HIGH | 4.5B |
| Discovery | shell/update.sh:diff_scripts/gen_list_repo/diff_cron/add_cron/del_cron; shell/managed_discovery.sh | 筛选/文本元数据/copy/diff | 有价值能力+旧 Shell 语义 | 需要能力 | REPLACE | TaskDiscoveryService + DiscoveryPolicy | 4.5B 仅抽库/DB 投影，完整新 discovery 在 11 | HIGH | 4.5B/11 |
| scripts staging | back/services/managedSubscription.ts:stage; shell/otask.sh | 发布运行副本、共享辅助文件 | 现 Task 路径尚未绑定 Worktree | 暂需 | TEMPORARY_BRIDGE | Task.worktree_id + entrypoint + lease + editor | Task/cwd/log/editor/config/deps/backup 全部退场 | CRITICAL | 9–12 |
| Scheduler | back/schedule/*; back/shared/scheduler*.ts; back/services/schedule.ts | 周期、恢复、队列、worker RPC | 平台需要调度 | 是 | KEEP | 领域与 transport 分层 | 队列与 readiness 不能视为 compat | HIGH | 9–10 |
| crontab.list / crond | back/services/cron.ts:setCrontab; shell/task.sh; shell/update.sh | 调度输出又被反查 task identity | 旧 Shell adapter | 暂需 | TEMPORARY_BRIDGE | DB Task 定义 + scheduler output | 先移除扫描器/CLI 反读，system adapter 10 再替换 | CRITICAL | 4.5B/10 |
| Execution shell | shell/task.sh; shell/otask.sh; shell/share.sh | 语言/cwd/hooks/status/日志/账号拆分 | 当前实际 Runner | 暂需 | TEMPORARY_BRIDGE | Execution Engine | 运行/停止/信号/日志/ENV/lease gates | CRITICAL | 10 |
| Global ENV | back/data/env.ts; back/services/env.ts; back/api/env.ts | 重复聚合、生成语言程序、旧 UI | 兼容语义 | Global 需要，旧语义不要 | REPLACE | 唯一 key Global 变量 + 统一 resolver | 所有执行分支切换；不得仅删 Envs | HIGH | 4.5B |
| Scoped ENV domain | back/data/scopedEnv.ts; back/services/repositoryEnvProfile.ts; back/services/scopedEnvVariable.ts; back/services/taskEnvironmentResolver.ts | Profile/override/UNSET/secret/snapshot | Phase 4 新核心 | 是 | KEEP | 统一 Global 和 Base allowlist | 去 global & 聚合；保留 secret/disabled fail-closed | HIGH | 4.5B |
| ENV generated files | back/services/executionEnvironmentTransport.ts; shell/preload/env.*; shell/preload/sitecustomize.* | 旧 global 程序副本 + overlay | 兼容三语言 | 当前仍必需，目标不需要 | REPLACE | 完整 child env transport | 全局-only/无ID/editor/三语言不能漏；之后删除生成器 | HIGH | 4.5B 条件完成 |
| Language preloads | shell/preload/sitecustomize.js; shell/preload/sitecustomize.py; shell/preload/esm-loader.mjs | ENV、hooks、QLAPI、全局包优先、signal | 多职责运行桥 | 部分暂需 | TEMPORARY_BRIDGE | ENV 4.5B / Hooks 5 / Runtime 6–8 / Runner 10 | 不能把删除 env.js 等同删除 preload | HIGH | 5–10 |
| Open API loopback | shell/api.sh; back/token.ts; back/loaders/express.ts | Shell status/stat/notify/reset；API rewrite | 旧 IPC 与对外 API 共用 | 暂需内部结果通道 | TEMPORARY_BRIDGE | domain calls in Backend + authenticated IPC for child | Shell 不能直接调用 Node service；先补结果通道 | CRITICAL | 4.5B 部分/10 |
| API | back/api/*.ts | 面板与 Open 路由混合 | 现产品入口 | 需要新资源 API | REPLACE | 单一平台 API + 显式 internal namespace | 认证与权限保留；详见逐 route 分类 | HIGH | 4.5B/10 |
| Frontend | src/pages/*; src/components/scoped-environment.tsx | 旧页面与新资源并列 | 渐进重构 UI | 需 IA 合并 | REPLACE | Repository/Tasks/Environment 为中心 | 运行能力入口替换后删；Scripts 保留 | MEDIUM | 4.5B/9–12 |
| Dependency | back/services/dependence.ts; back/config/util.ts; shell/node_path_cache.sh | pip/pnpm/system 全局安装和查找 | 当前 runtime 供给 | 暂需 | TEMPORARY_BRIDGE | Runtime Environment | 不再增加新依赖；Runtime 安装/锁/取消可用后删 | HIGH | 6–8 |
| Filesystem | back/config/index.ts; back/loaders/initFile.ts; shell/share.sh | 多根路径/可执行 config/复制 | 混合 source/cache/runtime | 需要集中 owner | REPLACE | PlatformPaths | 保持 git/worktree 双向指针；禁止通配清空 data | CRITICAL | 4.5B–14 |
| Logs | back/shared/logReader.ts; back/shared/logStreamManager.ts; back/services/log.ts; shell/task.sh | 文件/offset/UTF8；path+id 身份 | 观测能力 | 是 | KEEP | TaskRun ID 主 identity | 保留 drain、限流和路径防护；日志根后迁 | MEDIUM | 10/13 |
| Notifications | back/services/notify.ts; back/services/grpc.ts | 后端 provider 分发 | 平台能力 | 是 | KEEP | 无共享可变请求状态的 NotificationService | 保留现 provider 与认证测试；非整个 shell notify 删除 | MEDIUM | 13 |
| Script notify / Shell notification | sample/notify.*; shell/preload/client.*; shell/api.sh:notify_api | 脚本SDK/扫描事件 | 旧 API/共享复制 | 部分行为可替换 | TEMPORARY_BRIDGE | 领域事件 + 显式 SDK | Managed 已可后端调用；脚本契约 10/13 定义 | MEDIUM | 4.5B/13 |
| CLI / operations | shell/update.sh; shell/start.sh; shell/check.sh; shell/rmlog.sh; back/loaders/deps.ts | ql 多子命令+启动工具 | 管理与执行混合 | 旧命令契约不要，运行职责暂需 | TEMPORARY_BRIDGE | 运维 entrypoint/服务能力 | bot与update删除不等于删ql/task symlink | HIGH | 4.5B–14 |
| Auth / security | back/services/user.ts; back/shared/password.ts; back/loaders/express.ts | 登录/2FA/session/初始化 | 安全能力非兼容垃圾 | 是 | KEEP | 显式 fresh admin bootstrap | 仅删 plaintext migration/auth.json 导入，不能删哈希/2FA | HIGH | 4.5B |
| Tests | test/; tests/phase0..4 | 核心+旧语义+桥接 characterization | 既有质量证据 | 分类保留 | REPLACE | 新 fresh platform baseline | 按 case 拆分，不整套旧测试丢弃 | HIGH | 4.5B |
| Docs | PHASE0..4_REPORT.md; docs/refactor/; refactor/1.roadmaps.md | 旧阶段记录/路线 | 历史证据 | 保留记录不作现行契约 | KEEP | architecture/ADR 为新方向 | 加 historical banner；不删除历史 | LOW | 4.5A |
| Config Assets / Runtime / new Runner | refactor/0.runtime_workspace_refactor.md | 设计，尚未落地 | 未来新核心 | 未来需要 | DEFER | Phase 5–10 | 本阶段只边界建议 | HIGH | 5–10 |

## 结论边界

名称包含 managed、fallback、migration、old 不构成死代码证明。Managed 中的 legacyCheckoutName、原扫描器、安全参数验证仍有实调用；网络重试、工作区恢复、调度 readiness 是核心可靠性能力。未确认任何整套 Scheduler/Dependency/Shell subsystem 可直接删除。

## Shell / CLI 补充逐文件职责

| File / Entry | Current responsibility | Need / replacement | Removal phase |
| --- | --- | --- | --- |
| shell/task.sh | 入口、参数、日志、ENV准备、信号 | TEMPORARY_BRIDGE→Runner | 10 |
| shell/otask.sh | cwd/语言/preload/执行/账号模式 | TEMPORARY_BRIDGE；去账号隐式模型可先分段 | 4.5B/10 |
| shell/share.sh | 路径、启动fix_config、ENV清理、task status/after、Git clone、运维 | 混合职责；提取平台Paths/Runner/boot，不整删 | 4.5B–10 |
| shell/update.sh (ql) | clone/raw+scanner+update/reload/check/rmlog/reset/bot | 先抽scanner、删旧source，运维桥暂留 | 4.5B–14 |
| shell/api.sh | system token、HTTP status/stat/notify/task CRUD/reset | Domain call（同进程）/结果IPC（跨进程） | 4.5B部分/10 |
| shell/managed_discovery.sh | 私有stage覆盖API函数产生计划 | 明确内部Discovery adapter | 4.5B抽边界/11替换 |
| shell/task_env.sh / task_env_redact.cjs | ENV快照CLI bridge/cleanup/脱敏 | 保留安全能力，整合full ENV后再Runner替换 | 4.5B/10 |
| shell/git_workspace_lock.py | POSIX锁+Git/Bash子进程监督 | KEEP新核心，不按Shell/helper删除 | 持续 |
| shell/node_path_cache.sh | pnpm global path缓存/锁 | TEMPORARY_BRIDGE→Runtime paths | 8 |
| shell/env.sh | 启动进程ENV store/restore | TEMPORARY_BRIDGE，非生成env.sh | 启动工具替换时 |
| shell/start.sh | Native安装/运行依赖/pm2/目录初始化 | 暂留部署入口，fresh bootstrap替换旧分支 | 4.5B–14 |
| shell/check.sh | 配置修复/工具安装/PM2日志/启动检查 | 运维能力保留，旧下载/恢复分开处理 | 后续部署收敛 |
| shell/rmlog.sh | 旧文件日志留存 | TEMPORARY_BRIDGE→Run日志retention | 13 |
| shell/bot.sh | 外部bot仓库获取+pip+jbot启动 | REMOVE产品功能及Docker/start caller | 4.5B |
| shell/pub.sh | 平台发布/上传工具，调用sample/tool.ts | DEFER供应链；不是任务Runner或legacy订阅 | 14/发行决策 |
| shell/lang/*.sh | Shell翻译字典 | 随实际consumer保留，旧CLI项可后删 | 对应bridge退场 |
| shell/preload/client.js; shell/preload/client.py | gRPC SDK、Python→Node客户端桥 | 未来显式SDK；当前QLAPI依赖 | 10/13 |
| shell/preload/esm-loader.mjs | 全局包优先ESM解析 | Runtime替代，不随ENV删除 | 8 |
| shell/notify.sh | 仓库中不存在该文件 | 实际通知位于api.sh notify_api、sample/notify.*、services/notify.ts | 不虚构文件删除 |

真实当前依赖图见[dependency graph](../../../diagnostics/phase4.5/dependency-graph.md)，dead/likely/used/unknown见[候选报告](../../../diagnostics/phase4.5/dead-code-candidates.md)。
