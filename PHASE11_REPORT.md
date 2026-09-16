# Phase 11 — Discovery v2 + Trigger Model

## Summary

**总体 PARTIAL；本机功能与回归 PASS。** 唯一环境门禁为 Linux：本机 Darwin 无 Docker/Podman/VM 或已配置 Linux runner，不能宣称 Linux 实机通过，残余适配器物理删除保持 `BLOCKED_BY_LINUX_GATE`。

基线 commit `e1ee6f80`；分支 `codex/phase11-discovery-triggers`。仅完成 Phase 11，未提交、推送、部署，也未开始 Phase 12。

完整证据汇总：[verification-summary.json](diagnostics/phase11/verification-summary.json)。

## Scope

将 Task 的调度字段拆为独立 Trigger，加入持久事件与幂等提交；Discovery 直接读取 Worktree，事务更新 Task / Cron Trigger。沿用 Phase 10 ExecutionResolver、immutable ExecutionContext、Runner、重试、并发、取消、timeout、leases 和恢复职责。

## Database Changes / Schema

Schema **v7 → v8**。变更前实际冻结 [platform-v7.json](back/schema/platform-v7.json)，没有把修改后的模型冒充 v7。

新增 `TaskTriggers / CronTriggers / WebhookTriggers / GitUpdateTriggers / TriggerEvents / DiscoveryPolicies`；TaskRuns 新增 trigger_id / event_id / submission_key。Tasks.schedule 与 Subscription 旧筛选字段移除。FK、类型/状态 guards 和幂等唯一索引生效。

## Trigger Domain

Task 可有零个或多个 CRON / WEBHOOK / GIT_UPDATE。MANUAL / API 只记录 Run 来源，不建 Trigger 行。Task 和 Trigger 启用状态独立。类型配置分表；Panel 写入严格字段与 expected_version。

Clone 默认停用 Task，复制 Trigger 为 USER；Webhook 生成新 endpoint / secret，不复用旧摘要。删除保留事件与 Run 历史，活跃 Run 仍保护 Task。

## Trigger Event Model

RECEIVED / PROCESSING / SUBMITTED / SKIPPED / FAILED 持久化。唯一 `(trigger_id,event_key)` 与 TaskRuns.submission_key 双层去重。事件只保存计划时间或 Git ID/commit 等安全 metadata，不保存 Webhook body。

## Cron Model

Cron 独立持有 expression、timezone、misfire_policy、next_fire_at、last_fire_at；支持多 Cron，使用已安装的 cron-parser **5.4.0**，无自制 cron 解析器。

## Timezone / DST

未指定时读取平台配置并冻结 effective IANA timezone，平台缺省 Asia/Shanghai。数据库时间为 UTC。固定 Clock 测试覆盖五/六段、别名、无效 zone、纽约春季缺失与秋季重复时间；行为以该解析器的确定语义为准。

## Misfire Policy

缺省 SKIP，允许 FIRE_ONCE；不提供 FIRE_ALL。过期游标在事务中与事件一起推进，不在重启时补发全部历史。

## Webhook Security

公开 POST `/hooks/<UUID>`；32 字节随机 secret，SHA-256 摘要落库，恒时比较。Bearer header；拒绝 query secret。仅创建/轮换/克隆响应显示一次，普通读取不返回 secret 或摘要。

认证先于 body parser 与事件写入；空 body 或 JSON，限制 64 KiB，拒绝畸形/超限/不支持的编码。Payload 不进入 ENV、arguments、Config、Hook、日志或执行快照。

## Webhook Idempotency

可选有界 Idempotency-Key 只保存摘要；同 key 返回同 Event/Run。未提供 key 时每次请求独立。HTTP 验收覆盖正确/错误授权、错误 JSON、超限、去重和 payload 不持久化。

## Git Update Trigger / Git Event Identity

成功 Git update → Discovery reconcile → 过滤 → Event → submit。ANY_CHANGE、入口文件 SOURCE_CHANGE、相对 glob PATH_FILTER。固定 argv diff 复用 GitCommandService；失败记录 FAILED 并关闭触发。

稳定身份包含 trigger、repository、worktree、before/after。无变化不触发，初次同步默认跳过。使用上次完整成功水位支持同 HEAD 重试。提交前核对 TaskSource 仍绑定事件的仓库/Worktree，重绑定则 SKIPPED。

## Discovery Policy / Discovery Reconcile

独立 Policy 保存 enabled、includes、excludes、languages、version 及最近结果。扫描普通 Worktree 文件，跳过符号链接与 .git/node_modules/.platform/venv/runtime 等目录；不复制 scripts、不生成 command。

相对 glob 支持 * / ** / ?，拒绝逃逸路径，匹配采用有界动态规划，避免用户模式导致正则回溯。支持 Python、JS、TS、Shell；无 Cron metadata 也可以形成 Task。

Preview 无写入；Apply 校验 Policy version，在单一 IMMEDIATE 事务批量创建/更新/停用 Task 与 Discovery Cron。Git 已成功但 Discovery 失败时保留工作区更新，记录失败阶段并允许原提交重试。

## Discovery Ownership / Cron Ownership

身份为 subscription_id + SHA256(relative_path)。保留用户 Runtime、ENV、Config、Hooks、Settings、arguments、enabled 与名称覆盖。文件移除停用 Task、保留资源/历史；重命名形成新身份。

发现 Cron 使用稳定 source-cron 身份；用户接管改为 USER。删除发现 Cron 用 disabled USER 覆盖防止再生。移除源 metadata 只删除仍由 DISCOVERY 持有的 Cron。迁移识别用户修改以及用户已清空旧 schedule 的情况。

## Trigger Scheduler / Trigger Recovery

一个共享 Clock 循环；按 next_fire_at 索引批量查询，无逐 Trigger timer。事件与游标原子提交；启动扫描未提交事件。只调用 ExecutionService.submit，不创建第二执行队列或重试系统。

实际 SIGKILL 覆盖 Run 创建与 Event link 之间、commit 之后；两个独立调度进程抢同一时间点仍只有一个 Event/Run。

## ExecutionService Integration / TaskRun Integration

submit 在同一事务中处理事件身份、既有 Run 查找、启用/readiness/来源绑定检查、Run 创建与 Event link。disabled、not-ready、binding changed、并发禁止均产生诊断 SKIPPED，不启动用户进程。执行循环与 Runner 核心保持原有职责。

## API / UI

任务页 Triggers 替换 Schedule：多 Cron、时区、misfire、next/last、Webhook 创建/轮换、Git 模式/路径/初次选项、最近事件和 Run 查看。订阅页独立 Policy 保存/Preview/Apply 与最近结果。

Panel Trigger CRUD、轮换、事件查询、Discovery Policy/preview/apply 严格分离；公开 Webhook 不借用 Panel/Open API。直接 `/tasks/:id/run` 默认 API，UI 显式提交 MANUAL。

## Migration

事务升级、故障回滚重试、fresh 与 migrated 完整 schema 一致、重启不重复迁移、FK 检查均通过。保留 Task ID、资源、历史和用户覆盖；不从投影恢复定义。

旧 regex/辅助文件筛选不能安全等价为 glob：保留 previous_settings 审计记录，暂停该 Policy 并标记 MIGRATED_FILTER_REVIEW_REQUIRED，由用户在新 Policy 中明确设置后启用，不静默扩大匹配范围。非法已存 Cron 会使升级完整回滚。

## Scheduler Bridge Removal / Discovery Bridge Removal

| Bridge | 结果 |
| --- | --- |
| B03 crontab.list / system crond | 正常 Task 路径 REMOVED；物理删除 BLOCKED_BY_LINUX_GATE |
| B04 node-schedule / gRPC | REDUCED；Subscription / 系统维护仍有消费者 |
| B07 staging Discovery adapter | REMOVED；旧 adapter、stage/copy/publication 与 Task 补偿入口删除 |
| B15 SchedulerProjection | 正常 Task 创建/更新/同步不再产生投影；历史表/API/统计保留 |
| B01、B09/B10、B14 | 保留编辑器、bootstrap/Linux package、历史日志职责 |

健康检查已改为实际 transport 探测，避免等待已退出的 Task 投影恢复。没有删除用户目录或唯一 Git 历史。

## Security / Performance

安全检查覆盖严格输入、密钥生命周期、路径与符号链接、payload 隔离、固定 Git argv、资源保护、幂等唯一索引及历史保留。

- **5000 files：首次 reconcile 40 次 SQL**，批量处理而非逐 Task 查询。
- **5000 Cron：1 个共享 timer**，EXPLAIN 命中 `cron_triggers_next_fire_at_trigger_id`。
- 最后并行回归中两次 reconcile 合计约 27.7 秒；这是带全量并行负载的测试记录，不作为性能 SLA。

## Linux Gate

**PARTIAL / BLOCKED_BY_LINUX_GATE**。本地真实进程、FD leases、SIGKILL、SSH Git、managed Python/Node、浏览器与重启已验证；不替代 Linux container/runner 实测。[Step 0](diagnostics/phase11/linux-step0.json)。

## Platform Regression / Acceptance Matrix

| Gate | 结果 / 证据 |
| --- | --- |
| 全量平台回归 | **382 passed / 0 failed / 3 skipped** — [日志](diagnostics/phase11/platform-tests-final.log) |
| managed Python / Node 执行 | **2 passed / 0 failed** — [日志](diagnostics/phase11/managed-regression.log) |
| 既有 Python/Node Environment 离线/租约/恢复 | **3 passed / 0 failed** — [日志](diagnostics/phase11/prior-managed-regression-final.log) |
| Backend build | PASS — [日志](diagnostics/phase11/backend-build-final.log) |
| Frontend build | PASS — [日志](diagnostics/phase11/frontend-build.log) |
| Typecheck regression | PASS：34 项原有诊断、0 新增；原始 tsc 仍非零 — [结果](diagnostics/phase11/final-typecheck.json) |
| Browser Cron | PASS：多定义、真实到期 Run、重启后再执行 |
| Browser Webhook | PASS：显示一次、刷新隐藏、真实 HTTP、幂等、重启执行 |
| Browser Git Update | PASS：真实 SSH origin commit → sync → discovery → Run，重启重复验证 |
| Fresh / restart E2E | PASS；真实 managed 环境、配置/Hook/ENV、FK 与 Secret 审计 — [结果](diagnostics/phase11/platform-e2e.json) |
| Schema / crash / dedup / scale | PASS；包含于全量 gate，额外明细见 tests/phase11 |
| 临时验收环境清理 | PASS；仅本次两个 owned 临时 Runtime 根 — [结果](diagnostics/phase11/cleanup-result.json) |
| Linux 实机 | PARTIAL |

3 个 skip 为原有 node-path lock 平台条件测试，未将其计入 PASS。旧 staging 专用的 3 组测试在 manifest 标记 ARCHIVED_LEGACY；替代覆盖为 Phase 11 Discovery/Git pipeline/scale 和 publication-integrity，并非删除现有安全验证。

## Temporary Bridges / Change Review

[桥接登记](TEMPORARY_BRIDGES.md#phase-11--discovery--triggers) 与 [静态审计](diagnostics/phase11/static-audit.json) 列出保留消费者。新 Trigger/Discovery 模块未引入 spawn、Runner、投影或 scripts staging 依赖。

GitNexus 已更新索引并对 HEAD、develop 执行 detect_changes；结果保持 critical，原因是 schema/启动/API 共享调用链。UNKNOWN 或缺失方法节点不视为无调用者，已结合实际引用和集成测试审查。完整输出未截断，使用临时输出列表上限调整，未修改工具分析逻辑或用户 Git index：[HEAD](diagnostics/phase11/graph-review-HEAD.json)、[develop](diagnostics/phase11/graph-review-develop.json)。

## Known Limitations

- Linux 物理适配器清理等待真实 Linux gate；旧统计/日志/编辑器桥仍保留。
- SOURCE_CHANGE 仅入口文件，不追踪完整 import graph。
- 源移除采用停用保留；文件恢复后不会擅自重新启用此前停用的 Task。
- 旧非等价 regex policy 需要在新 glob UI 复核；不增加旧 DSL 兼容层。
- 历史 typecheck 34 项仍待独立清理。

## Important Findings

1. Run 创建和 Event link 可以在现有 SQLite 提交事务内完成，避免引入第二队列。
2. 健康检查是旧 Task 调度恢复的隐藏消费者，退出旧路径时必须同步解除。
3. Git 成功与 Discovery 成功必须分别记录，重试使用完整成功水位才能兼顾不漏发与不重复。
4. 发现所有权需要保留用户删除/清空操作的身份，不能仅依据当前是否存在 Cron 行。

## Phase 12 Preconditions

Phase 11 本地功能与回归门禁已满足。下一阶段建议 **Phase 12 — Code Workspace + Git Editor**，继续遵守 Worktree 所有权、引用和 leases；Linux 待验项仍应保留明确状态。本任务到此 STOP，未实施 Phase 12。

设计细节：[13 份 Phase 11 文档](docs/refactor/phase11/01-trigger-domain.md)；[四张架构图](docs/architecture/15-discovery-triggers.md)。
