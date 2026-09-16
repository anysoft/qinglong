# Phase 9 Status: PARTIAL

Phase 9 — Task Domain + Resource Binding。当前实现以 Task 为唯一领域定义，保留现有调度及执行桥。核心功能与本地验收已通过；总体 PARTIAL 来自 Linux 实际 CI 未执行和既有 TypeScript 债务。

| Item | Status |
|---|---|
| Resume Recovery | PASS |
| Schema | PASS — v5 → v6 / fresh v6 |
| Task Domain | PASS |
| Task Source | PASS |
| Runtime Binding | PASS |
| Resource Resolution | PASS |
| Task Readiness | PASS |
| Execution Settings | PASS — 声明与验证 |
| Discovery Integration | PASS |
| Scheduler Bridge | PASS |
| API / UI | PASS |
| Migration E2E | PASS |
| Fresh E2E | PASS — real browser / empty DATA_DIR |
| Browser Validation | PASS |
| Linux Validation | PARTIAL — actual CI pending |

## Resume Checkpoint

Phase 9 resumed after interrupted Codex session. Existing working-tree changes were preserved and audited before continuation.

恢复时分支为 `codex/phase9-task-domain`，HEAD 为 Phase 8 的 `47294399de53dd857caa8caa936fc9d4dbab0586`。源码、测试、diagnostics 与十份 Phase 9 文档已存在，根报告尚未创建。已有记录显示主体实现完成，最后未通过项是浏览器流程；订阅删除专项测试完成。恢复后没有 reset、clean、stash、重新 checkout、重建整个实现、提交、推送或部署。

恢复证据：`diagnostics/phase9/resume-worktree-inventory.txt`、`resume-inventory.json`。清单按 Schema、Domain、Source、Runtime、Settings、Resolver、Readiness、Discovery、Scheduler、API、Frontend、Tests、Diagnostics、Docs、Bridges 分类。最终状态以本报告及最终日志为准，不把历史失败日志覆盖成成功记录。

## Database Changes

新增 `Tasks`、`TaskSources`、`TaskRuntimeBindings`、`TaskExecutionSettings`、`RuntimeDefaults`。旧 `Crontabs` 的剩余执行数据位于 `SchedulerProjections`，其 ID 外键指向 Tasks，不能独立创建定义。统计与视图为 `TaskStats`、`TaskViews`；RunningInstances 的物理归属列为 `task_id`，保留当前 wire 属性映射。

Task ENV、Config Bindings、Hooks 正式外键指向 Tasks。定义与关联更新使用事务、版本检查和删除保护；Runtime Default 必须恰好属于 Repository 或 Subscription。

## Task Domain

正式属性包括 Identity、name/description、enabled、MANUAL/DISCOVERED、subscription/discovery ownership、version、timestamps、schedule 和结构化 arguments。TaskService 提供 CRUD、clone、readiness 与发现协调。删除只清除 Task-owned 定义与绑定，不删除 Repository、Worktree、Environment、Config Asset 或用户日志。

Clone 生成禁用的 MANUAL Task，不复制发现身份；复制 Source、Runtime、ENV、Config、Hooks、Settings 与 Schedule。Secret 在数据库事务内复制，不通过读取 DTO 回显。脱离 Subscription 时把所继承的 Subscription Runtime/Profile 固化为显式逻辑绑定，避免语义丢失。

## Task Source

`WORKTREE_ENTRYPOINT` = Worktree ID + relative entrypoint + language + cwd mode/relative cwd；arguments 是字符串数组。Task 不存 raw command、绝对 Worktree 路径或 staging 路径。

## Source Security

拒绝 POSIX/Windows 绝对路径、驱动器前缀、反斜线、`.`/`..` 段、NUL/control、逃逸路径、symlink 与非普通入口文件。保存、Validate 和当前 Run 进行深度文件检查；列表展示逻辑资源状态，不把列表当成执行授权。

覆盖 FIFO/socket、目录、缺失入口、语言扩展名不匹配、参数类型/数量/字节长度。当前投影对特殊入口安全引用，system crontab 的 `%` 另行转义。现有发现适配器的文件名白名单继续有效。

## Runtime Binding

PYTHON → PythonEnvironment；JAVASCRIPT/TYPESCRIPT → NodeEnvironment；SHELL → Shell。绑定仅存逻辑 Environment ID，禁止任意 executable 或 Build ID。未配置不会静默回退为系统解释器。

## Runtime Defaults

固定优先级：Task explicit → Subscription default → Repository default → UNBOUND。支持继承、覆盖、重置；Runtime 类型必须匹配 Source。当前 Build 的 Runtime/Node Toolchain 失效时给出资源不可用诊断，保留 immutable Build 及已有 lease 契约。

## Resource References

Worktree、Python/Node Environment 的删除保护包含 Task 引用；Environment 检查显式、默认值与有效继承引用。Repository/Worktree/Environment UI 提供 Task 引用诊断。Profile 与 Config 继续使用既有归属及引用保护。数据库约束补充服务层竞态防护。

Subscription 有发现 Task 时普通删除在取消调度前拒绝；显式关联删除通过调度事务删除发现定义。注入调度失败时恢复 Subscription、Task 和 Hook；手工 Task 与共享资源保留。

## ENV Integration

沿用 Global → Repository Profile → Task Override，Profile 选择遵循 Task / Subscription / Repository。跨 Repository Profile 拒绝。Task ENV 的外键切换到 Task，查询 API 同步更新；Secret 仍受既有存储、脱敏与响应边界保护。

## Config Integration

沿用 Phase 5 Repository/Task ATTACH/MASK 与目标路径验证，TaskConfigBindings 指向 Tasks。逻辑 Resolver 仅给出资源摘要；执行时 revision snapshot、物化与恢复仍由原服务负责。

## Hooks Integration

TaskHooks 指向 Tasks；BEFORE、AFTER_SUCCESS、AFTER_FAILURE、FINALLY 语义保留。逻辑预览不返回 Hook command snapshot。修复嵌套 Task/Hook 表单重复 HTML ID，保证编辑 Hook 名称定位到正确字段。

## Execution Settings

存储和验证 timeout、max_attempts、initial_delay_seconds、FIXED/EXPONENTIAL、FORBID/QUEUE/ALLOW、NONE/FAILURE/SUCCESS/ALWAYS。Phase 9 不执行新 retry/concurrency/notification policy，也不存通知凭据。

## Task Readiness

统一 READY、CONFIGURATION_REQUIRED、INVALID、SOURCE_MISSING、RESOURCE_UNAVAILABLE 与诊断码。enabled 不等于 READY；启用失败返回诊断，调度注册也按当前 readiness 屏蔽不可用定义。

## Resource Resolution

TaskResourceResolver 输出逻辑 IDs、相对源路径、Runtime/Profile 来源、Config/Hook 摘要、Settings 与 readiness。无 executable、绝对 cwd、argv command、Build pin、完整 ENV、Config revision snapshot 或 lease。1000 Task 实测 **24 次批量查询**，API 状态查询再加 1 次，无逐 Task N+1。

## Discovery Integration

沿用现有发现适配器与稳定 subscription_id + discovery_key，发布目标改为 TaskService。发现更新遵守字段所有权，保留用户 name/schedule override、Runtime、ENV、Config、Hooks、enabled 与 Settings。改名/删除、冲突及失败补偿有真实 Git 测试。

## Scheduler Bridge

Task → SchedulerBridgeService → 当前适配器。`crontab.list` 仅派生输出；API 定义变更通过调度锁与 SQLite 事务协调，注册/写文件失败回滚并恢复原调度，恢复失败返回明确错误。发现发布先从 canonical TaskSource 刷新投影。

旧 `/crons` 产品写接口与 SDK/gRPC 定义写入口返回 `410 TASK_API_REQUIRED`，禁止绕过 Task 定义直接写 projection。当前 status/result/log transport 保留。

## Current Runner Bridge

TaskExecutionBridge / TaskExecutionSourceBridge 隔离原执行器，B17 从 TaskSource 获取逻辑来源。当前 Shell/host interpreter 执行回归不能被理解为 managed Environment 已激活。

非空 arguments 的 Task 可保存与校验，但当前执行桥明确拒绝运行；没有已发布 Subscription 来源的 Manual Task 同样不能直接执行。Phase 10 统一提供原生 argv 与 Worktree 执行，不引入半套 Runner。

## API Changes

新增 `/tasks` CRUD、enabled、clone、resources、validate、run/stop/log/logs，Source 浏览与 Repository/Subscription Runtime Defaults、资源引用接口。Task 定义入口要求 Panel 会话并使用严格字段验证与 optimistic version。

## UI Changes

产品主入口为 Tasks，移除原 raw-command Task 编辑器。编辑器包含 General、Source、Runtime、ENV、Config、Hooks、Schedule、Execution Settings、Resource Preview。Source 从 Worktree 选择入口并推导语言，显示 Runtime 来源、Readiness 与当前执行桥限制。旧日志组件保留为明确 bridge。

## Migration

冻结真实 Phase 8 schema v5：model signature `632024721991a6f497272ff0d8e73f120705fa3f8ff279e0b0729e8a29ea4510`；DDL signature `70f7d5ad6dbc652be20b6611834b1a85f3613de4b02cfd7487c22b3eff80defe`。v1–v4 冻结定义不重写。

v5→v6 保留旧 Task ID、ENV Secret、Config/Hooks、Stats/Views/Running 记录，以及 Runtime/Environment 资源。Source 只由旧结构化 source_relative_path + Subscription Worktree 迁移。command-only 保留记录并进入待配置状态，不解析 command 猜源。Fresh 直接建 v6。测试验证规范 DDL 相同、FK clean、失败 rollback、retry、带数据升级与重启。

## Tests

- 最终平台回归：**366 total / 363 passed / 0 failed / 3 skipped**，`diagnostics/phase9/platform-tests-final.log`。
- 真实 managed Python venv/pip + Node npm/pnpm + 生命周期：**3 passed / 0 failed**，`managed-regression.log` 与三个 `*-result.json`。
- Typecheck：原预算 53，剩余 **34 历史错误 / 0 新增**；regression gate PASS，完整类型检查 PARTIAL。
- Static audit：PASS；所有剩余 Cron 与依赖桥引用已分类。
- Backend Build：PASS；Frontend Build：PASS，最终构建进程均退出 0。日志为 `backend-build.log`、`frontend-build.log`。前端仍有 bundle size 提示，不影响构建通过。
- Browser/Fresh：PASS，22 个流程步骤，检查 687 个 API 响应和 23 个 WebSocket 帧，无测试 Secret 泄漏；不使用 HTTP mock。浏览器使用实际后端、SQLite、SSH Git、Worktree、venv/pip/npm，官方已验证 Runtime artifact 复制到隔离安装目录。provider catalog/setup 使用测试夹具，不能将本项当成再次验证官方在线下载。
- 补充重启编辑器验收：PASS；重启后实际重新打开 Task，核对 Source language、arguments、timeout、retry、concurrency 和 notification，证据 `browser-restart-editor.json` / `.png`。
- 测试夹具清理：PASS；2 个本次创建的 managed 根目录经 6 次正式 verify/remove 操作后移除，记录 `cleanup-result.json`；用户数据未删除。
- Linux：workflow 已接入 Phase 9，但本机为 macOS，实际 CI pending；3 个平台跳过不能记作 Linux PASS。

## Temporary Bridges

B15 的 Crontab 定义职责 REMOVED；SchedulerProjections 仅剩派生职责。B17 REDUCED 为 TaskSource-aware，B07 REDUCED 为发现适配器。

B01、B02、B03、B04、B06、B08、B09/B10、B14 仍 TEMPORARY。尤其 B09/B10 仍被当前 Runner 消费，不能因 Environment 绑定建立就删除。详见 TEMPORARY_BRIDGES.md Phase 9 表。

## Known Limitations

Linux 实际运行尚无证据；34 项既有 TypeScript 问题未扩大。新 Runtime 实际 Task 执行、TypeScript 执行工具、原生 argv、新 Retry/Concurrency/Notification 行为均属于 Phase 10。现有 scheduler/runner/protobuf/日志桥继续保留。

## Important Findings

1. Task 领域、共享资源与执行投影必须分别维护；仅重命名模型无法阻止旧 API/SDK 绕过定义，因此旧写入口已关闭。
2. Runtime readiness 应以 current Build 关联的 Runtime/Toolchain 为准，不以 Environment 待构建的目标配置替代。
3. GitNexus impact 对核心 Resolver、scheduler 等报告 HIGH/CRITICAL，已在编辑前告知并进行对应回归。最终 detect_changes 对 HEAD 与 develop 执行：HEAD 402 个符号 / 405 个流程 / 368 个文件，develop 797 个符号 / 410 个流程 / 959 个文件，均为 critical（文件数包含诊断与文档）；develop 含 Phase 6–8 累积变化，不能全部归为 Phase 9。图索引存在入口/分支裁剪，不能替代测试或据空调用图删除代码。

## Phase 10 Preconditions

后续需消费 Task、TaskSource、TaskRuntimeBinding、TaskResourceResolver 与 Settings；一次性建立 Execution Resolver/ExecutionContext/Runner v2，执行开始才固定 Python/Node Build、Runtime/Toolchain 与 Worktree lease，并接入现有 ENV snapshot、Config materialization/recovery 与 Hook 生命周期。保留 B01/B02/B08/B09/B10，直到新旧执行、安全、恢复和 Linux gates 完成。

Recommended Next Phase：Phase 10 — Execution Resolver + ExecutionContext + Runner v2。**本任务不开始 Phase 10。**
