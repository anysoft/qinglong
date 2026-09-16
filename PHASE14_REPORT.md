# Phase 14 Status: PARTIAL

> **ALL PHASE14 FUNCTIONAL GATES PASS**
> **ONLY LINUX VALIDATION DEFERRED TO PHASE15**

日期：2026-09-16。平台：Darwin arm64；基线：`fd4270e1`。本报告覆盖 Phase 14 foundation 与 continuation，取代原 foundation-only 报告。没有实现 Phase 12/15/16，没有新增旧青龙格式兼容或 migration path。未提交、未推送。

## Gate matrix

| Item | Status |
|---|---|
| Data Classification | PASS |
| Backup Coordinator / Consistent Snapshot | PASS |
| Manifest / Component Inventory / Atomic READY | PASS |
| SQLite Backup / WAL independence | PASS |
| Git / Worktree / local-only refs / dirty state | PASS |
| Config / Secret Backup | PASS |
| Run / Log Backup | PASS |
| Notification State | PASS |
| Portable Encryption / Import | PASS |
| Backup Validation | PASS |
| Restore Staging / Pending / Cancel | PASS |
| Offline Restore / Startup Bootstrap | PASS |
| Restore Journal / Safety Snapshot / Atomic Switch | PASS |
| Seven Crash Points / Rollback | PASS |
| Git Repair across roots | PASS |
| Runtime Reconciliation / Explicit Resource Rebuild | PASS |
| Browser Backup / Import / Restart Restore | PASS |
| Fresh Disaster Recovery complete chain | PASS |
| B16 Normal Platform Backup/Restore Path | PASS — REMOVED FROM NORMAL PATH |
| Platform Regression | PASS — 438 tests / 435 passed / 0 failed / 3 skipped |
| Backend / Frontend Build | PASS |
| Typecheck regression | PASS — 32 historical / 0 new |
| Static Audit | PASS |
| Linux Validation | PARTIAL — Phase 15 |

## Production entry points

- Settings →「备份与恢复」：创建、列表、详情、验证、删除、加密导出/下载、加密导入、验证导入、输入 RESTORE 暂存、取消 pending、状态与显式重建。
- Panel API：`POST/GET /api/backups`；`GET/DELETE /api/backups/:id`；`POST .../:id/validate`、`.../:id/export`；`GET /api/backups/exports/:id/download`、`/api/backups/operations/:id`。
- Restore API：`POST /api/restores/import`、`/api/restores/:id/validate`、`/api/restores/:id/stage`；`DELETE /api/restores/:id/stage`；`GET /api/restore/status`；`POST /api/restore/rebuild`。
- Offline CLI：`node static/build/backupCli.js list|create|validate|export|import|stage|apply|recover|cancel|status`。口令从 stdin 或私有 `--passphrase-file` 输入；不接受口令 argv。
- Primary bootstrap：backend lifetime lease → RestoreService.apply → abandoned backup/operation recovery → private DB preparation → canonical DB bootstrap → workers/schedulers。坏 journal 不能绕过恢复进入普通启动。

Schema 保持 **v9**。没有 schema 10，没有手写另一套 CREATE TABLE。快照校验冻结 schema identities；候选调用正式 `initializeOperationalSchema` 迁移链。

## Backup coordinator and barrier consumers

`BackupCoordinator` 在跨进程共享写租约排空后持排他快照租约。等待现有 TaskRuns、RuntimeOperations、Git/Worktree critical sections、Notification SENDING 完成；默认 600 秒，上限 3600 秒。超时返回 BACKUP_BUSY，保留业务工作并恢复 admission。

| Consumer | Covered lifetime |
|---|---|
| Panel / Open API / Webhook | HTTP admission；全部异步业务 route handler 独立保留至 Promise 结束，客户端断连不提前释放写租约 |
| Execution submit / tick / execute / recover | 新 producer 暂停，已接收 queue drain，最终 Run/Log/Config 清理完成才释放 |
| TriggerScheduler / TriggerEvents | 暂停新 Cron/Webhook/Git trigger admission；不改变既有 misfire / disabled Cron 语义 |
| ManagedSubscription | fetch → worktree update → discovery → Git event critical section |
| RuntimeOperation / Python & Node Environment | request admission、后台 execute/recover、环境定义 mutation |
| NotificationDispatcher | claim → HTTP delivery → result/outbox 持久化 |
| ScheduleService / token / Runtime / Hook children | 排队回调及最终 onEnd；子进程继承 FD 租约 |

AsyncLocalStorage admission 不代替锁。嵌套后台操作持自己的 FD；primary、cluster workers、托管子进程继承 backend lifetime lease，离线 restore 不能越过仍活跃的 cooperating processes。

## Snapshot components and exclusions

包括自包含 SQLite、完整 bare Git objects/refs/reflogs、Worktree tracked/dirty/untracked/ignored 数据、安全相对 symlink、Config 所有 revision、ENV/Credential/Channel/Webhook 秘密、Hook/Task/Trigger 定义、历史 Run/Attempt/Event/Result、日志、TaskHealth、Outbox、Delivery，以及其他用户数据（含内部单文件 bak 副本）。

排除经 ownership 审计的 Python/Node runtime/toolchain/environment 物理材料、平台锁、明确缓存/临时执行目录和 syslog。逻辑 Runtime/Environment/Revision/Build/lock 定义仍在数据库中。未知 runtime 内容、未解决 quarantine 或 materialization recovery journal 会阻止备份，不删除或静默跳过。排除按平台相对路径，不按任意 `venv`、`node_modules`、`.tmp` 文件名过滤 Worktree。

SQLite 以 VACUUM INTO 创建副本，校验 integrity/FK 并 fsync；不复制 live DB/WAL。Config checksum 和 storage key 单独核验。Run/Config 按 500 行扫描；历史缺失日志统计并对预期存在的缺失日志给出警告。存在的 Run log 必须为私有普通文件。

## Format / manifest / encryption

- Snapshot v1：private owner marker、manifest.json、streaming inventory.ndjson、data、READY。目录 0700、快照文件 0600；原始 `0777` mode 位记录于 inventory，恢复时还原 executable/file/directory mode。
- Manifest：UUID、时间、应用版本、OS/arch、schema、components、排除策略、DB/inventory hashes、domain counts、Git identity、总字节与条目数；不放秘密值或源绝对路径。公开 DTO 仅白名单字段，并显示校验和历史缺失日志警告。
- READY 只在全部 inventory/DB/Config/Git 校验后 fsync + rename 发布。失败 staging 不作为 READY 显示。
- Archive：PLATARC1，有界流式 framing，无压缩；100 万 entries、128 GiB 单文件、1 TiB 内容、深度 128、16 KiB 行/entry header、64 MiB path-set budget。超限拒绝，不截断。
- Portable：PLATBKP1，scrypt N=32768/r=8/p=1，AES-256-GCM，随机 salt/nonce，固定 header AAD。认证成功前不解包；只下载完整密文。路径错误、错误口令、认证失败均清理私有临时产物与所持口令 Buffer。

本地 snapshot 本来就含敏感明文。SHA256 防意外篡改，不能代替同 UID 攻击者边界内的认证签名；便携文件通过 GCM 认证。JavaScript 字符串由运行时回收，不能声称可确定擦除。

## Restore bootstrap / journal / rollback

Panel 只做 import/validate/stage/cancel。Stage 持 barrier 写外置 journal 与 RESTORE_PENDING，新的业务写入被拒绝。CLI apply 或重启 primary 必须先拿 backend.lock。

候选在外置 control/candidates 中准备：验证源 → 复制 → 正式 schema migration → Git repair → Runtime reconciliation → domain 验证 → 恢复 mode → 已有非空 DATA_DIR 的 safety snapshot。支持不存在或预创建为空的目标目录；空目录不制造虚假的 safety snapshot。

严格同文件系统 rename：live → quarantine，candidate → live。journal 路径由本机 resolver + UUID 确定，记录 checksum、manifest hash、old/candidate dev+ino，不能信任源绝对路径。原数据不自动永久删除。最终 Git/DB/Config 验证成功才 COMPLETE；失败保留 failed candidate 并回滚，未知身份冲突进入 RESTORE_RECOVERY_REQUIRED。

状态：PENDING → PREPARING → PREPARED → OLD_ROOT_MOVED → CANDIDATE_PUBLISHED → VALIDATING → COMPLETE；另有 CANCELLED / ROLLED_BACK。终态清理匹配 pending marker，取消状态先持久化再清理。恢复也处理两次 rollback rename 之间的中断。

| SIGKILL point | Result |
|---|---|
| during schema migration | PASS — resume, safety/original preserved |
| during Git repair | PASS — resume |
| after candidate validation | PASS — resume |
| after old root rename | PASS — inode-proven resume |
| after candidate publish | PASS — inode-proven resume |
| before startup validation | PASS — resume |
| after startup validation | PASS — resume to COMPLETE |

另通过：post-switch validation failure → ROLLED_BACK；candidate/quarantine substitution → fail closed；malformed/tampered journal → refuse startup；empty destination；原目录仍存在时 candidate Git repair 不修改原 registration。

Git repair 仅处理复制后的 bare/admin 与 Worktree registration，重建自己的指针后才调用 `git worktree repair`。拒绝 config include、外部 filter/diff driver、core.worktree 等配置；不 fetch/reset/clean，不依赖 origin。

## Runtime reconciliation / rebuild

Python provider 物理安装缺失标 MISSING；Node provider 的逻辑 catalog 元数据保留。Python/Node installations MISSING；toolchains ERROR；Build health MISSING；Environment ERROR。历史 immutable Build/lock 保留，current reference 保留但不再可用，绝不 fallback 到系统解释器。

显式重建复用 RuntimeOperationService：Python provider/runtime → Node runtime/toolchain → Python/Node environment build/rebuild。成功资源退出动态清单；失败资源继续显示，不能误报整体成功。安装器故障按正式 Runtime/Environment 管理界面诊断，不承诺自动重试所有故障。Restore 本身不访问 Git/PyPI/Node dist/npm，重建是之后独立动作。

Notification 只 reconcile orphan ownership：SENDING delivery → INTERRUPTED；SENDING outbox → RETRY，清 claim。SENT/DEAD、历史 delivery、incident、TaskHealth、Trigger identity、Webhook secret 保留。

## Fresh restore evidence

完整证据：`diagnostics/phase14/platform-e2e.json` **PASS，53 个步骤**；浏览器检查 **1,525 个 API 响应、114 个 WebSocket 帧（含 63 个 Run log 帧）**，fixture secret 泄漏为 0。对应恢复 pending 和旧 Run log 截图保存在同目录。

夹具从空 A 建账号、SSH Credential、Git Repository/Worktree、Subscription/Discovery、托管 Python/Node 环境、ENV/Config secret、Hook、三语言 Task、Cron/Webhook/Git Trigger、成功/失败/恢复 Run、日志与通知历史。真实浏览器创建/验证备份、加密导出、错误口令拒绝、正确导入、stage、停后端再启动应用恢复。

之后真正删除 A，将 origin 移至不可用位置，通过 CLI 在不同绝对路径 B 导入/暂存，启动恢复并重新登录。验证 local-only branch/tag/commit、dirty/untracked/symlink、历史日志/健康/通知/Trigger，显式重建并执行任务，再复验 Cron、原 Webhook secret、Git 新提交、失败与恢复通知。

Runtime 证据限定：CPython 3.13.15 与 Node 24.21.0 先由正式 manager 从官方来源安装/验证；浏览器用受控 adapter 复用这些已验证 artifact，venv/pip、Node dependency build、正式 operation/state/path ownership 与任务执行均真实。没有使用宿主 Python/Node 作为 Task fallback；不将浏览器阶段描述为重新联网编译 CPython。

## Validation and scale

最终正式回归：**438 tests / 435 passed / 0 failed / 3 skipped**，约 145.3 秒。日志：`diagnostics/phase14/continuation-platform.log`。新增测试已纳入 `tests/platform/test-baseline.json`，原有平台测试未删除或弱化。fixture 修复包括真实 lease helper、清理顺序、唯一 Worktree 名、onEnd 后异步租约释放等待，auth-only HTTP test 的独立 middleware mock，以及用实际 QUIESCING/idle 信号替代屏障测试固定 40ms 等待；生产 HTTP 路径另由实际浏览器与断连测试覆盖。

规模：100,000 TaskRuns、100 MiB log、2,000 Git files，执行 create/validate/restore/safety snapshot，50ms RSS 采样。最终耗时 **49,840 ms**；RSS start **228,769,792 bytes**、peak **390,971,392 bytes（约 372.9 MiB）**、end **348,127,232 bytes**，**974 个采样**，见 continuation-platform.log；没有承诺硬 SLA，也不把 RSS 峰值直接等同算法常量内存。

Backend/Frontend build 通过。Typecheck：32 条历史基线、0 条新增。静态 gate 检查 B16 实现/入口、shell syntax、fixture secret diagnostics、platform manifest、diff whitespace；不能将这六项检查夸大为通用安全证明。

GitNexus 使用本地 backend；初次新增符号 UNKNOWN 有人工 caller review。最终 graph review 见 diagnostics/phase14/GRAPH_REVIEW.md。全量 develop 比较跨所有既有阶段并有截断，缺失图边不等于无调用方。关键 HIGH/CRITICAL 风险均在修改前报告。

## B16 exit evidence

SystemService exportData/importData 删除；Settings Other 旧上传/下载删除；旧 PUT system/data/import/export 返回 410；reloadSystem(data) 拒绝；Shell reload data 在停服务/删除操作前返回 64。新完整备份入口仅指向 Backup domain。

`api/script` 编辑前的单文件 data/bak 副本保留内部数据保护责任，并被新完整快照保存。它不是旧 tar 平台备份，不借本阶段提前实现 Phase 12 编辑器或删除用户副本。B13/B14 的 Phase 13 责任保持。

## Known limitations

1. **Linux 尚未资格验证**，按 roadmap 留给 Phase 15；Darwin 测试不冒充 Linux。
2. 3 个既有 GNU timeout/锁相关测试在 Darwin skip；Typecheck 保持既有 32 条错误基线。
3. Local snapshot 是敏感明文；portable 无压缩。operator 必须保护存储和口令，并自行配置部署 HTTPS。
4. BACKUP_DIR 为单实例专用目录，不支持多个运行中 DATA_DIR 共同管理同一存储。外部同 UID 编辑器必须遵守锁；平台不是 OS sandbox。
5. runtime/dependency materialization 不 portable；重建可能需要网络/编译工具和原 registry。原唯一 Git/用户数据不能依赖远端重建。
6. journal、quarantine、failed candidate、安全快照和未知文件不自动永久删除；需要管理员按 ownership 与保留策略处理。
7. disabled Cron 仍可能生成 SKIPPED TriggerEvent/推进运行时间戳，沿用 Phase 15 收敛项；本阶段不改变其产品语义。

## Next phase

全部 Phase 14 业务 Gate 已通过。推荐下一阶段：**Phase 12 — Code Workspace + Git Editor**；之后 Phase 16A → Phase 15 → Phase 16B。本任务在此停止，没有实现这些阶段。
