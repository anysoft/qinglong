# Greenfield Legacy Audit & Removal Plan

## Executive Summary

**Phase 4.5A: PASS（审计与计划完成，未执行清理）。** 新方向为 **Git-native Script Automation / Scheduling Platform，Fresh Install Only**。不再保留 QingLong 数据库、API、Filesystem、Subscription、ENV、Dependency 或 CLI 兼容义务。

本次以当前生产文件内容审计，含 Phase 4 实现；审计期间 HEAD 更新为 `e3d3f17f`（Phase 4 commit），文件指纹用于区分提交状态与实际修改。没有删除生产代码、修改schema/API/UI/runtime、运行安装器或重置数据。前序报告是历史记录，新设计以 architecture/ADR 为准。

最重要的结论：

1. **旧 Git 获取可以清理，整个 Shell 不能删。** Managed 仍 source update.sh 的 scanner；bot 还调用 clone helper，ql 还有运维消费者。
2. **scripts/ 必须作为 TEMPORARY_BRIDGE 保留。** Task/cwd/editor/log/discovery/dependency copy 都依赖它；最终删除需要 Phase 9–12，不能只把 command 指向 Worktree。
3. **Phase 4 snapshot 还不能直接替代 env.py/env.js。** 当前只传 scoped overlay，另复制三份 Global 程序；先统一所有入口的 full child environment 再删生成器。
4. **DB→crontab.list→Shell→OpenAPI→DB 回环仍存在。** Managed Task publication 已改为直接 CronService 调用，但 scanner仍反读投影，Task status/stat仍走Shell HTTP。
5. **fresh-only 不等于 unsafe reset。** 新平台可以拒绝旧库，但不能清空已有库、Git本地历史或活跃工作区；安全、恢复、锁与lease是核心。

## Audit Evidence / Coverage

完整阅读 Phase 0–4 报告、docs/refactor 专项记录和 refactor/1.roadmaps.md；按当前源码核对相互过时的说明。诊断目录包含 [必读清单](diagnostics/phase4.5/required-reading.json)、[起始状态](diagnostics/phase4.5/starting-status.txt)、[生产完整性](diagnostics/phase4.5/verification.json)。

- [当前依赖图与删除影响](diagnostics/phase4.5/dependency-graph.md)、[dead-code候选与证据等级](diagnostics/phase4.5/dead-code-candidates.md)。
- 全部分类覆盖 Database/Models/Services/API/Frontend/Git/Repository/Worktree/Subscription/Discovery/Task/Scheduler/Execution/ENV/Dependency/Filesystem/Logs/Notifications/Shell/CLI/Tests/Docs。
- [组件清单](docs/refactor/phase4.5/01-legacy-inventory.md)：逐项10列，包含职责、存在原因、替代、前置、风险和phase。
- [完整API清单](diagnostics/phase4.5/api-inventory.md)：19个API文件、198条展开后的endpoint声明（含重复，非唯一URL计数）；实际权限另由express/session/scopes决定。
- [全部78个测试文件与case标题分类](diagnostics/phase4.5/test-inventory.md)，不删除或修改测试。
- [静态搜索helper](diagnostics/phase4.5/inventory.py)：仅读取源码，输出八类引用JSON；不导入App/DB，不安装依赖。
- GitNexus CLI绑定qinglong，索引已刷新；[query](diagnostics/phase4.5/query-publication.txt)、[context](diagnostics/phase4.5/context-managed.txt)、[impact](diagnostics/phase4.5/impact-setCrontab.txt)。MCP未提供，CLI是实际工具证据。动态Shell/DI/route图不完整，零边不是dead proof。

## Current Compatibility Debt

| Debt | 当前证据 | Target |
| --- | --- | --- |
| LEGACY/MANAGED 双轨 | Subscription.git_mode、handleTask/ID helper条件分支、mode UI | 唯一Repository-required sync |
| 原URL/SSH alias/内嵌密码 | config/subscription、Subscription.pull_option、SshKeyService | Repository owns credential |
| 新Managed依赖旧命名/校验 | SubscriptionGitResolver无条件validateLegacyGitArguments；stage用legacyCheckoutName | 新context + ID publication prefix |
| Discovery/copy/definition混合 | update.sh scanner、managed_discovery、publishSubscription | policy→definitions→reconcile |
| ENV双实现 | Envs &聚合/三文件；Scoped full variables未完整传输 | unique keys + literal full env |
| DB bootstrap混合升级 | 九ORM sync +21 ledger；initData旧路径/auth导入 | fresh operational schema v1 |
| Shell作为IPC | api.sh status/stat/token/notify/reset | 受限Runner结果协议/内部domain调用 |
| 路径作为身份 | scripts prefix、alias日志、command解析编辑链接 | Task/Run/Workspace IDs |

## New Platform Core

KEEP：GitCredential/CredentialSecret/secure resolver；Repository元数据与持久bare storage；Worktree lifecycle/status/FF-only；GitCommand argv runner；Repository lock/Worktree lease/supervisor；Managed sync的锁序、失败保留与恢复；Scoped Profile/Override/UNSET/Secret/纯resolver；认证/2FA/路径权限；日志drain/UTF8/进程取消/调度readiness。

这些能力即使从零设计也需要。名称 inherited、实现基于旧服务不等于compatibility-only。未来重命名时应使用GitNexus rename并保留责任边界，不能全局字符串替换。

## Components To Remove

在4.5B相应gate后：Legacy URL/raw/clone分支；git_mode/convert/旧UI selector；Subscription credential override/pull_option/pull_type/proxy；旧auth.json/路径迁移与启动ql repo/raw；crontab import和410兼容路由；重复repository metadata delete route；bot与其clone消费者；旧Global duplicate/trim/template及env生成器（先替换）。

`data/repo`/`data/raw`从新布局移除；不对既有目录执行清空。完整文件与调用链见[Git计划](docs/refactor/phase4.5/03-git-cleanup-plan.md)。

### Safe To Remove Immediately（下一阶段，无功能替代的最小候选）

- update.sh已注释掉的两个旧update API调用块。
- 当前主路由中被workspace handler遮蔽的重复DELETE repositories handler（保留前者与其引用保护）。
- 旧compatibility文档作为“现行约束”的地位——本次仅已用historical标记替代，历史内容仍保留。

其余run_nohup/unused export等仅Likely Dead；仍需下一阶段再查调用。**本次没有任何生产删除。**

## Components To Replace

4.5B有限整合：fresh bootstrap/操作schema；Repository-only subscription context；DB→scanner输入与ID prefix；unique Global+full env transport；ENV UI/API合并。保留原调度执行adapter。

后续：Config Assets/Hooks（5）；Runtime及依赖环境（6–8）；Task/Schedule/TaskRun（9–10）；Execution Engine/结果IPC/lease（10）；TaskDiscoveryService（11）；Workspace editor（12）；Notification/Observability（13）；Backup（14）。

## Temporary Bridges

详见[完整桥登记](TEMPORARY_BRIDGES.md)：scripts、task.sh/otask.sh、crontab.list/system crond、scheduler transport/queues、旧Global文件（待替代）、preload其他职责、scanner、status/stat/token回环、global dependencies/deps/dep_cache、config/hooks、ql运维、script notify、旧log identity、Crontab/Run模型、backup。

“暂留”不是无限期：每项均有consumer、planned replacement、phase和exit gate。新代码禁止增加其内部耦合。

## Target Database

[全部现表/启动链/折叠计划](docs/refactor/phase4.5/02-database-cleanup-plan.md) 与 [目标ER/FK](docs/architecture/06-database-target.md)。16个主库表（含ledger）+独立Keyv cache；没有独立User/Notification表。

目标 credentials/repositories/worktrees/subscriptions/tasks/schedules/task_runs/environment_profiles/environment_variables/task_environment_variables/global_environment_variables。Repository→Worktree/Profile、Subscription→Repository、Task→Subscription/Worktree 用真实FK和RESTRICT；聚合内变量CASCADE；Run历史保留，Task软删。NULL若代表匿名/继承/未准备生命周期仍合法，不能因greenfield全部NOT NULL。

4.5B operational baseline v1暂保留桥表；不借fresh schema提前实施Task Domain/Runner。新平台自己后续版本升级仍允许，旧QingLong升级不支持。

## Target Filesystem

目标data/{db,git,worktrees,runtime,config-assets,logs,cache,tmp,locks,uploads,backups}。详细owner/删除条件见[目录计划](docs/refactor/phase4.5/08-filesystem-cleanup-plan.md)。移除repo/raw取决于旧source和bot；scripts/deps/dep_cache必须留桥。源码根scripts是构建工具，非任务目录。

## Target Service Boundaries

[Service边界](docs/architecture/07-service-boundaries.md)：Repository/Git/Worktree只管源码资源；Sync协调；Discovery只产definitions；TaskService拥有定义；Scheduler触发；ENV纯解析；Runner管child/lease/exit/log；Notification消费事件。Backend同进程用direct service call，Shell跨进程用明确IPC，不把HTTP关闭当替换。

## Target API

新平台单一资源API（建议/api/v1），内部结果/通知协议独立认证。4.5B先去明确兼容与重复入口，不要求同时重写全部版本前缀。必须保留当前Shell status/stat/token until replacement；新资源不能因去/open兼容而变成未鉴权接口。

## Target Frontend IA

Dashboard；Repositories{Credentials,Repositories,Subscriptions}；Tasks；Environment；Config Assets；Code Editor；Runtime；Logs；Compare；Settings；Backup；API。

4.5B合并已实现资源入口、去Legacy/Manual URL、统一Global/Profile/Task ENV。Script/Config/Dependency/Task旧页面在能力替代前保留。完整页面与API表见[专项计划](docs/refactor/phase4.5/07-api-ui-cleanup-plan.md)。

## Test Baseline Reset

[测试重置计划](docs/refactor/phase4.5/09-test-baseline-plan.md)。按case分类：PLATFORM CORE / LEGACY REGRESSION / COMPATIBILITY / TEMPORARY BRIDGE / ARCHIVE。保留安全与失败语义，归档破坏性clone/模板执行/旧库升级等纯历史断言。78文件不整套删；298通过是Phase4历史结果，不是新平台必须保留的数量，也不是本次重跑声明。

新baseline至少包括Credential/Repository/Worktree/Subscription/Discovery/ENV/Task bridge/Scheduler bridge/Security/Concurrency/Fresh install。Linux空volume/crond/flock、浏览器、build是4.5B release gate。

## Cleanup Order

完整可执行步骤：[10-cleanup-execution-order.md](docs/refactor/phase4.5/10-cleanup-execution-order.md)。

0. 固定core+bridge baseline和fresh fixtures。
1. fresh operational schema/bootstrap，去旧启动迁移。
2. Repository-only subscription + credential归仓库，去双轨/convert。
3. 抽Discovery adapter、DB投影、ID publication prefix，保留scripts bridge。
4. 删除旧Git/raw/bot路径及失去consumer的helper、旧目录创建。
5. 统一Global/full environment，再删生成文件与对应imports。
6. API/UI收敛，保留内部结果通道。
7. filesystem/test/docs收尾，空安装/全桥回归验收。

## Risk Matrix

| 风险 | Level | 必须 gate |
| --- | --- | --- |
| fresh schema替换/误判旧库可清空 | CRITICAL | 非空拒绝；rollback；桥表完整；FK一致 |
| scripts立即删除 | CRITICAL | Task source/cwd/log/lease/editor全部承接，否则禁止 |
| setCrontab/scheduler publication | CRITICAL（GitNexus） | 7直接调用方/8总影响；CRUD/发布/恢复/启禁均验证 |
| /open全删 | CRITICAL | 新status/stat/notify/reset协议；真实exit入库 |
| env.py/js/preload删除 | HIGH | full map、global-only/no-ID、三语言/Secret/hook职责分离 |
| legacy Git/helper删除 | HIGH | Managed scanner脱离update.sh；bot callers退场 |
| credential override/alias去除 | MEDIUM–HIGH | Repo-only resolver、ID prefix/日志身份 |
| UI入口合并/历史文档标记 | LOW–MEDIUM | 引用、路由、权限、内容保留 |

架构风险与工具等级分开表述。GitNexus索引不是Shell可达性的完备证明；本次没有编辑生产符号。已向用户明确CRITICAL影响。

## Blocking Dependencies

- 去scanner前必须承接metadata/filter/reconcile；Managed已使用其函数。
- 去legacyCheckoutName前必须解除scripts namespace、collision、remote spelling限制。
- 去env生成器前必须传full variables，取消无scope early-return，处理无ID editor path与clear_env。
- 去scripts前必须Task/worktree绑定+执行lease+编辑器新来源；当前没有这些。
- 去/open/token前必须真实运行结果通道；Backend direct call无法跨Shell边界。
- 去deps/dep_cache前必须可运行Runtime Environment；这些目录包含安装本体。
- 去update.sh整文件前必须抽scanner并承接reload/backup/health/reset等运维职责。

## Phase 4.5B Scope

**SHOULD delete**：明确旧mode/source/URL认证/转换、旧bootstrap migration语义、失去caller的clone/raw/bot、旧Global程序（有替代）、兼容routes/UI/cases。

**SHOULD replace**：fresh schema、Repository-only resolver、DB discovery projection、ID scripts namespace、Global+full child ENV、ENV API/UI。

**SHOULD keep temporarily**：[TEMPORARY_BRIDGES.md](TEMPORARY_BRIDGES.md)的运行桥，尤其scripts、Runner、scheduler、preload非ENV职责、dependencies、status/stat/token与运维。

**MUST NOT touch**：不实现Phase5–14功能；不删除核心Git安全/锁/lease/认证/进程日志可靠性；不重置用户数据；不整删Shell、Scheduler、Dependency、scripts。

本阶段交付只用于下一份正式清理prompt；没有执行4.5B。ENV等条件项若无法有限替换，应保留并报告阻塞，不以裸删满足清理数量。
