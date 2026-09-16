# Phase 13 Status: PARTIAL

Phase13 — TaskRun Observability + Logs + Notification Platform。工作分支 `codex/phase13-observability`，起点 `de01f425`。只实施本阶段；没有commit、push、部署、Backup、Code Editor或Release workflow变更。

| Item | Status |
|---|---|
| Schema v9 | PASS |
| TaskRun Events | PASS |
| Run History | PASS |
| Logs | PASS |
| Live Logs | PASS |
| Dashboard | PASS |
| Task Health | PASS |
| Notification Channels | PASS |
| Notification Policy | PASS |
| Notification Outbox | PASS |
| Notification Delivery | PASS |
| Failure / Recovery | PASS |
| Crash Recovery | PASS |
| API / UI | PASS |
| Browser E2E | PASS |
| Fresh E2E | PASS |
| Linux Validation | PARTIAL — Phase15 |

## Tests / Builds / Typecheck

平台全量：**398 passed / 0 failed / 3 skipped**（401 tests）；独立真实managed执行2/2，旧managed环境生命周期3/3，合计**403 passed / 0 failed / 3 skipped**（不重复累计专项测试）。实时脱敏及执行针对性回归21/21。Backend/Frontend构建PASS。Typecheck原34项、剩余32项、新增0，raw tsc exit2；预算gate PASS，类型债务未清零。原有bundle size / Browserslist提示保留。

最终证据：[平台回归](diagnostics/phase13/platform-tests-final.log)、[专项](diagnostics/phase13/focused-final.log)、[托管执行](diagnostics/phase13/managed-execution.log)、[环境生命周期](diagnostics/phase13/managed-regression.log)、[浏览器](diagnostics/phase13/platform-e2e.json)、[后端](diagnostics/phase13/backend-build-final.log)、[前端](diagnostics/phase13/frontend-build-final.log)、[类型预算](diagnostics/phase13/final-typecheck.json)。首次失败日志保留为修复过程证据，不用作最终PASS。

## Database Changes / Migration

冻结真实v8到platform-v8.json/platformV8.ts，再显式迁移v9。旧v1..v7冻结文件不变。TaskRuns/Attempts只加列，不drop/recreate；增加Events、Health、Channels、Policies、bindings、Outbox、Deliveries与索引/SQL触发器。新表SQL-owned，正式bootstrap必须走initializeOperationalSchema。

测试验证fresh v9 == migrated v9 schema signature、晚期DDL失败rollback/retry、FK clean、Tasks/Runs/Attempts/Triggers/TriggerEvents保留、旧通知凭据及四种enum映射。Health回填使用SQL聚合，以finished_at/id解决同时间先后问题，不将百万历史装入JS。

## TaskRun Event Model / Timeline

Run内sequence唯一递增；数据库产生submit/state/cancel/attempt事件，Coordinator产生Hooks/MAIN/retry/recovery事件。最多200条一页，UI Timeline可翻页。metadata仅短静态phase/status/attempt/retry delay/hook ID。stdout/stderr仍是文件，不变成SQLite行。RunnerV2未修改。

## Run History / Attempt History / Resource Snapshot

正式Runs API按ID DESC keyset分页，支持Task/status/trigger/time filters，每页≤100。Detail展示Run/Task/TriggerEvent identity、起止时间/duration、结果/exit/signal/error、Attempts、快照与日志metadata。Attempts保留canonical result、hook outcomes、重试决定及delay；Run最终结果是唯一执行事实。

Resources沿用Phase10 executionMetadata白名单：Task版本、Repository/Worktree/Environment/Runtime/Build/Revision/Toolchain ID、source/dependency hash、Config revision与Hook version。没有ENV明文、Config内容、Hook command、Webhook payload或Credential。旧Run无法证明的细节不伪造。

## Log Architecture / Live Logs

正式文件仍是`data/log/task-runs/run-ID.log`，保留drain/fsync；流式脱敏仅缓存可能匹配Secret的尾部，安全短输出立即写入。GET /task-runs/:id/log默认64KiB tail，可cursor/offset/tail=false；单次≤256KiB+4字节，处理UTF-8边界。路径由ID构造，拒绝raw/path/symlink/异常owner或权限；cursor绑定Run和dev/ino，拒绝换文件/越界。

复用已认证SockJS；每连接一个RUN_LOG_SUBSCRIBE，500ms服务端有界读取。UI用HTTP cursor推进，socket唤醒+1秒轮询兜底；刷新重读，展示保留最后2MiB。没有第二套socket server。终态记录log_size/last_log_at，Dashboard不递归扫DATA_DIR。

旧LogService/API与rmlog已排除task-runs。正常Task/Runs UI只走正式Run域；旧Task latest-log API仍作有界兼容读取，非事实源。日志默认不删除。

## Dashboard / Statistics

Dashboard支持24h/7d/30d、Task总数/enabled/readiness、成功/失败/超时/成功率、queue/running、最近Run/失败、最长运行、不健康Tasks与storage metadata。SQL聚合，不加载所有Run；Task列表状态改为SQL每Task最新Run。

成功率分母为SUCCESS/FAILED/TIMEOUT/INTERRUPTED；取消和跳过不计。Readiness批次500、缓存30秒；Health来自执行结果，二者独立。Task stats API提供同时间窗统计。

## Task Health / Failure Incident / Recovery

FAILED/TIMEOUT/INTERRUPTED递增连续失败；SUCCESS清零并设HEALTHY；CANCELLED/SKIPPED保持失败计数和health，只更新最后终态。无结果UNKNOWN。

达到阈值且实际创建失败Outbox才打开incident。默认新preset只通知一次；repeat_every_failures显式启用重复。成功且incident已打开才允许RECOVERY，它替代普通SUCCESS，事务内关闭incident。ALLOW并发按终态提交顺序维护；旧历史按finished_at/id推导。

## Notification Channel Domain / Channel Providers / Secret Handling

Channel独立于Task，含name/type/enabled/is_default/version/protected secret/archive。25个类型：原24个provider全部保留，另加结构化WEBHOOK。每次delivery创建独立adapter实例，不共享title/content/params，不读Task ENV、不回退全局凭据。

23个HTTP旧适配器通过本地真实接收器验证payload/response parsing；邮件通过真实SMTP接收器；额外验证multipart。测试重定向目的地址到fixture，不把外部生产provider可用性当作已经验证。

Secret遵守KEEP/REPLACE/DELETE，GET仅secret_configured。全部连接配置保守存入受保护secret列；复用平台现有私有DATA_DIR/SQLite权限模型，**数据库仍plaintext at rest，没有自创crypto，也不宣称加密**。归档清凭据但保留投递历史。

Channel Test生成明确TEST消息并入Outbox，结果在Delivery UI；旧Settings入口换为Channels，旧独立通知表单已删除，旧User notification写接口410。B13登录/显式SDK内部旧配置保留，旧异常输出改静态code。

## Task Notification Policy

正式flags覆盖success/failure/timeout/interrupted/cancelled/recovery，阈值1..1000、可选重复、DEFAULT/EXPLICIT/NONE模式、多Channel binding、version。TIMEOUT/INTERRUPTED专用flag覆盖generic failure。仅最终Run通知，不逐Attempt。

v8 NONE/FAILURE/SUCCESS/ALWAYS按实际旧行为迁移：失败模式保留取消通知，repeat=1保留旧每次失败通知；recovery默认关闭。新UI preset取消=false/recovery=true/repeat=0。旧settings.notification仅作为迁移和创建preset输入，不再由ExecutionService消费。Task clone复制正式Policy/bindings。

## Notification Outbox / Atomic Transaction

SQLite终态触发器让TaskRun终态、TaskHealth、incident和Outbox插入处于同一个原事务。去重键Run:event:channel UNIQUE；消息仅Task ID/name和Run安全结果metadata。终态提交不等待HTTP/SMTP。

无任何async notification错误追加到ExecutionResult.secondaryErrors。Provider失败只属于Delivery域。数据库故障按事务整体回滚，不产生“结果提交但逻辑通知丢失”的应用层窗口。

## Notification Delivery / Retry

Dispatcher每秒最多取32条，4并发。先持notification-ID FD lease，再短事务claim/建attempt；网络在事务外。默认5次、60秒指数退避、上限1小时，禁用/缺Secret/无效URL直接DEAD。记录static error，不保存provider原文。

Delivery页可按Run查询、keyset翻页、查看attempt历史、手工重试RETRY/DEAD；复用Outbox identity/dedupe key，保留尝试次数。shutdown停止claim，最多等45秒活跃发送。

## Crash Recovery

真实独立进程SIGKILL覆盖：终态提交前回滚、提交后实际HTTP续发、threshold第三次失败及success恢复的前后窗口、两个worker竞争、外部已收件但SENT前崩溃。

SENDING取得FD lease后先持久化RETRY，原attempt标INTERRUPTED，下轮重新发送。正式contract为**durable at-least-once delivery with internal deduplication**；外部确认与DB之间窗口可能重复，不承诺exactly-once。WEBHOOK发送Idempotency-Key，旧provider不假定支持。

## API / UI

新增Panel路由：task-runs列表/detail/attempts/events/log；observability/summary；tasks/:id/health/stats/notification-policy；notification-providers/channels；notification-deliveries及attempts/retry；安全trigger-event详情。新路由拒绝Open token路径，认证沿用现有Panel/session。错误统一静态码。

新增Runs和Notifications导航。Task编辑页含Runs/Health/Notifications；Run详情含Overview/Attempts/Timeline/Resources/Logs/Notifications。Trigger→Run深链接、Run→TriggerEvent详情。Dashboard切换为TaskRun统计，Settings通知页复用Channels。

## Browser / Fresh E2E

**PASS，38 steps**；检查1,530个HTTP响应、110个WebSocket帧（65个Run log帧），0测试Secret泄漏。最终结果和截图见[浏览器证据](diagnostics/phase13/platform-e2e.json)。空DATA_DIR、真实浏览器、真实SSH Git、官方Runtime artifact、实际venv/npm依赖、ENV/Config/Hooks、Task/Trigger、Channel/Policy、Run失败/恢复/Retry/Timeout、HTTP通知、日志追加/刷新、重启历史与自动Outbox恢复均纳入脚本。Browser仅复用本阶段实际安装的官方Runtime artifact以避免重复编译，不用宿主解释器冒充managed Runtime。

## Security / Performance / Static Audit

通知HTTP：HTTP/S、无userinfo、URL≤4096、10秒timeout、64KiBresponse、no redirect。**Notification Webhook拥有平台网络访问能力**，管理员可选私网接收器，不宣称完整SSRF防御。新Channel错误不返回URL/token/header/provider body。HTTP/WebSocket canary审计检查Secret泄漏。

100,000 terminal Runs验证keyset/SQL aggregate/Task stats，无JS全历史加载；100MiB sparse日志验证tail/cursor有界；10,000 Outbox以实际扫描SQL EXPLAIN验证索引。查询次数有界，Dispatcher claim有批次/并发上限。

静态审计146条相关引用已分类，Runner无同步通知；无新旧Stats/Views依赖、全文件Run readFile或secret snapshot。RunnerV2及历史schema文件不变。[审计](diagnostics/phase13/static-audit.json)。

## Retention / Phase 14 Preconditions

automatic destructive retention = OFF。Task/Channel删除不顺手删除日志与投递史。Storage只用缓存metadata，历史迁移文件可能未计入、运行中的log bytes非实时。

Phase14需保护独有定义/凭据、Git本地与dirty内容、Run/Attempt/Event/Outbox/Delivery、日志和incident状态；协调DB与工作区/journal/活跃发送窗口。Runtime/cache可重建不代表可无条件删除。当前Backup bridge未承诺覆盖所有新域。本阶段未实现Backup/Restore。

## Bridge Cleanup

- B14正常Task路径已替换：Run ID + cursor日志/Live follow。旧系统/Subscription日志、兼容latest-run读取保留；rmlog不触及Run日志。
- B13同步最终执行通知已移除，替换为Outbox；显式SDK与登录系统通知保留旧内部配置。没有把旧SDK伪装成已迁移Channel事件。
- B15 Dashboard/Task status消费者已切TaskRuns，旧历史表/API保留。
- B03/B04/B07按Phase11保持回归；B16等待Phase14，其余活跃lease/supervisor/恢复职责未误删。

完整consumer/replacement/status/exit condition见[TEMPORARY_BRIDGES](TEMPORARY_BRIDGES.md#phase-13--observability--notifications)。没有删除现有用户数据。

## Platform Regression / Important Findings

1. Phase3真实Git测试夹具原用sequelize.sync，遗漏SQL-owned表；改走正式operational initializer后链路通过。不能为测试另建简化schema。
2. 原Task状态列表读取所有历史Run，已改SQL latest-per-task。
3. Sequelize cursor SQL的绑定符号需正确分词，keyset下一页已实测。
4. 健康迁移同时间Run须用ID排序，已增加success→fail→cancel/skip夹具。
5. 原全局通知enum与新incident默认不同，显式repeat=1迁移保留旧行为。
6. multipart必须由客户端生成boundary；新增真实网络回归。
7. 浏览器发现旧脱敏器总缓存最长Secret长度，短输出延迟至终态；改为仅保留可能的Secret前缀，补跨块/Unicode/重叠Secret测试，未修改Runner。
8. 旧Node生命周期首次在并行负载下未赶上3秒超时用例的ready标记；单独整套复跑3/3通过，失败记录保留。浏览器Discovery Preview曾撞上编辑弹窗refs查询的仓库lease；验收改为等待refs响应后操作，没有放宽锁或修改Trigger/Scheduler。
9. 观测页额外暴露既有Cron行为：本次关闭测试Trigger后仍持续创建TRIGGER_DISABLED/SKIPPED记录，未执行MAIN。按本阶段不重构Trigger/Scheduler的约束保留，后续收敛应检查禁用计划是否应停止产生事件；本阶段已验证SKIPPED不改变失败计数。
10. GitNexus核心入口CRITICAL，已事前提示。HEAD影响38 flows；develop累计输出有截断、索引有追踪预算遗漏，不宣称完整图证明，人工静态/动态回归补充。详见[Graph Review](diagnostics/phase13/GRAPH_REVIEW.md)。

## Linux Gate / Known Limitations

- 本机Darwin arm64；Linux Validation=PARTIAL，按约定集中Phase15。不增加GitHub Actions/Docker/Release配置。
- Typecheck有32项既有债务，新增0；整体不称为零错误。
- SQLite protected storage仍为plaintext at rest；管理员文件系统权限可读取。
- 外部notification可能在crash窗口重复；有限重试耗尽需人工处理DEAD。
- UI暂以原provider命名字段JSON编辑secret，未为24种provider另建专属表单。
- 日志展示保留2MiB；大日志刷新从cursor文件源分块追赶；旧历史缺失事件/attempt结果不回填虚构记录。
- 禁用Cron仍可产生TRIGGER_DISABLED/SKIPPED历史（既有Scheduler行为），本阶段未改Scheduler。
- 自动Retention OFF，容量metadata不是全盘实时统计。旧system/SDK通知及Backup bridge仍有登记消费者。
- providers本地协议通过不等于外部账号授权/网络可用性认证；实际收件平台应使用Channel Test。

## Test Fixture Cleanup

本阶段创建的官方Python/Node测试根已通过生产Verify/Remove流程清理，两个根均已删除；浏览器临时DATA_DIR也由harness关闭并清理。没有触碰既有用户DATA_DIR。证据：[cleanup-result](diagnostics/phase13/cleanup-result.json)。

## Recommended Next Phase

**Phase 14 — Backup / Restore**。Phase13完成后STOP，未进入Phase12、14或16。后续顺序固定14→12→15→16。

设计文档：[docs/refactor/phase13](docs/refactor/phase13/01-observability-domain.md)（14份）；架构：[Run Observability](docs/architecture/16-task-run-observability.md)、[Notification Platform](docs/architecture/17-notification-platform.md)。

新装向导移除旧通知表单：先创建账户，登录后从Notifications配置正式Channel。Settings不再读取旧User notification DTO。
