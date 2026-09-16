# Phase 15 Status: PARTIAL

**LOCAL_CONVERGENCE_PASS / GITHUB_HOSTED_QUALIFICATION_PENDING**
本地最终验证、证据脱敏与资源清理已完成。不能用入口 SHA 的 Phase16A 全绿替代新代码的 Linux 验证。

## Entry Baseline

- 分支：`develop`。
- 入口 HEAD：`abd5939e316a918126cdadcf887ff7d756ab51db`；入口工作区干净。
- 前序功能基线：Phase0–14（含后完成的 Code Workspace）及 Phase16A Linux CI。
- Phase15 主变更已提交为 `f61de1c158100d3ec8fbdfd0aa18681f2f3d47c5`；本报告所在后续候选提交补齐 Hosted socket 10 轮门禁。尚未推送；schema v9。

## Phase16A Freeze

已冻结 [full run 35098329236](https://github.com/anysoft/qinglong/actions/runs/35098329236)：
`workflow_dispatch`，同一入口 SHA，preflight/core/managed-runtime/browser/ci-summary 全部成功。
用户提供的 Ubuntu 24.04.5 x86_64 核心结果为 469/469、0 fail、0 skip；历史 TypeScript budget 为 22，remaining 4，new 0。

保留最初失败 run 35078896295 → normal 成功 35096852979 → full 成功 35098329236 的历史。
`PHASE16A_REPORT.md` 与 `diagnostics/phase16a/final-gates.json` 标记其为 CI Foundation PASS，明确 **NOT_PHASE15_QUALIFICATION**。

## Architecture Convergence

正式链路：Repository → Worktree → Task/资源绑定 → TriggerEvent → ExecutionResolver → 不可变 ExecutionContext → Runner v2 → TaskRun/Attempt → Logs/Outbox/Delivery。

已物理移除诊断 Shell 执行、Cron 投影 HTTP/gRPC、脚本 staging/source mapper、旧全局依赖管理、隐式 preload/SDK、内置 token loopback、ql 运维胶水和旧 Config/Script 页面。Task API 的正式 facade 直接操作 TaskRun。

正式架构见 `docs/architecture/00-platform-overview.md` 与 01/05/06/07/08/20；前序阶段报告仍保留历史含义。

## Temporary Bridges

**Source/ownership gate：Temporary remaining = 0。** 这不等于完整 Linux Qualification PASS。

| Bridge | Decision | Replacement / formal owner |
|---|---|---|
| B01 staging/editor | REMOVE_PHYSICALLY | Code Workspace / ExecutionResolver |
| B02 task.sh/otask | REMOVE_PHYSICALLY | Runner v2 / immutable Context |
| B03 crontab projection | REMOVE_PHYSICALLY | TriggerScheduler / TriggerEvents |
| B04 internal scheduler | FORMALIZE_AS_REAL_INTERNAL_COMPONENT | Subscription recurrence、mTLS ENV/notification/health |
| B05 generated ENV | REMOVE_PHYSICALLY | Frozen ENV；旧 private environment.sh writer 也已移除 |
| B06 implicit preload | REMOVE_PHYSICALLY | Explicit Build / Hook / ENV |
| B07 staging discovery | REMOVE_PHYSICALLY | DiscoveryService |
| B08 shell status/token | REMOVE_PHYSICALLY | Supervisor result channel / TaskRun |
| B09 global dependencies | REMOVE_PHYSICALLY | Python/Node Environment；OS 工具由显式运维提供 |
| B10 deps/cache lookup | REMOVE_PHYSICALLY | Immutable Build / domain cache |
| B11 shell settings | FORMALIZE_AS_REAL_INTERNAL_COMPONENT | Typed System settings |
| B12 ql operations | REMOVE_PHYSICALLY | Foreground startup、进程监督、RetentionService |
| B13 notification | FORMALIZE_AS_REAL_INTERNAL_COMPONENT | Explicit providers/optional source SDK、Outbox |
| B14 log identity | FORMALIZE_AS_REAL_INTERNAL_COMPONENT | Run logs、Subscription logs、Winston rotation |
| B15 old live task facts | REMOVE_PHYSICALLY | TaskRun/Attempt/Observability；保留 v9 历史存储 |
| B16 old backup routes | REMOVE_PHYSICALLY | BackupCoordinator / RestoreService |
| B17 staging workspace | FORMALIZE_AS_REAL_INTERNAL_COMPONENT | Worktree identity；Config materialization/journal/lease |

逐项消费者、文件和替代验证：`docs/refactor/phase15/05-bridge-finalization.md`。
现有用户目录和历史表没有被删除。测试处置映射见 `diagnostics/phase15/test-disposition.json`。

## Disabled Cron

| 项目 | 最终语义 / 证据 |
|---|---|
| Scheduler participation | SQL 在 LIMIT 前排除 disabled Trigger，501 个 disabled 不阻塞正常任务 |
| Event / Run | disable 提交后的 tick 不新建事件/运行；事务前已提交事件不被伪装删除 |
| next_fire_at | v9 NOT NULL 保留冻结的 dormant 值；UI 显示 disabled，不作为活跃截止时间 |
| Restart | 不推进 dormant deadline，不补跑禁用期间积压 |
| Re-enable | 写事务中按当前时间计算未来时间，不回放禁用区间 |
| Concurrency | 10 轮真实 disable/tick 子进程竞争 |
| DST / late recovery | 继续运行既有 Phase11 Cron/DST/misfire/recovery gates |

原始失败和修复后证据分别保留；没有 schema bump、远未来 sentinel 或测试 skip。

## Linux Native

| 语义 | 本地真实测试 | Ubuntu 24.04 |
|---|---|---|
| flock / inherited FD / descendant lifetime | PASS | PENDING |
| FD across Node/Python/Shell exec，私有 FD 不泄露 | PASS | PENDING |
| TERM/KILL / grandchild cleanup | PASS | PENDING |
| rename no-replace，竞争/Unicode/symlink | PASS | PENDING |
| file/parent fsync 与回滚 | PASS | PENDING |
| restore switch / crash journal | PASS | PENDING |
| Unix socket owner crash/restart | PASS；20 并发，10 轮 stress | PENDING |

本地宿主是 Darwin，不能据此宣称 Linux PASS。Socket 并发暴露 SQLite 写入竞争，现以有界串行 admission 修复，原协议 deadline 未提高。

## Runtime

真实 CPython 3.13.15 / pyenv 2.8.5 与 Node 24.21.0。
Environment 3/3、managed Execution 2/2、Shell 5/5 通过；移除桥后 managed Execution 已再次 2/2 通过。
依赖 Build、版本固定、隔离、offline cache、引用保护、取消/恢复继续覆盖。没有 host interpreter/global package fallback。

## Execution

正式 Task 覆盖 Shell/Python/Node ESM/tsx 的空值、Unicode、多行/大值、字面量 metacharacters、UNSET、脱敏和无命令插值。
50 次 live Resolver/Runner 验证配置从 A 改为 B 时既有 Context 仍为 A。
PREPARE/BEFORE/MAIN/AFTER/FINALLY、CONTINUE、输出非法、重试、超时、取消和后代清理走真实 Runner。

## Workspace / Git

完整 Phase12 浏览器通过：编辑/保存/Git diff、显式 commit/push、dirty/untracked、运行忙状态、备份和异地恢复。
Phase14 复验另发现订阅编辑页 refs 查询与准备操作竞争：准备先返回 409、refs 后返回 200。现按钮等待查询完成，并以 10 轮延迟 refs 场景验证。
凭据、Git argv、路径/no-follow/no-overwrite 和 Worktree lease 边界保留。

## Trigger / Discovery

手工、正式 Cron、Webhook、Git transition 都汇入 TaskRun；没有系统 crontab 发布器。
Discovery 保留稳定身份、用户覆盖、disabled/tombstone；失败不推进成功 watermark。
5,000 文件 Discovery 使用 40 次写查询；5,000 Cron 使用一个 timer 和 due index。

## Observability / Notification

Run/Attempt/events/log cursor、实时流、脱敏、重连、健康窗口、Outbox 重试/恢复均保留。
覆盖 100,000 Runs、100 MiB 日志、10,000 Outbox 行。
Task 自动删日志仍关闭；Subscription 清理只操作生成的日志文件，排除活动订阅、符号链接、TaskRun 和用户文件。System 日志由 Winston 轮转。

## Backup / Restore

原有一致性、SQLite、portable archive、错误口令、Git/Config 校验、崩溃恢复测试通过。
完整浏览器已走过 READY backup、加密导出、stage/restart、销毁原数据根、异地恢复、离线 Git/local commit/dirty/untracked/symlink 和历史日志校验。
**最终完整浏览器 PASS**：恢复后 managed Python/Node 与依赖环境重建、三语言任务、原 Webhook secret、Cron、Git transition、失败/恢复通知及 v9 重启审计全部通过。此前一轮 rebuild 60 秒超时保留为失败记录；未延长成功判定期限，根因未被证实，最终完整复验通过不抹去该不稳定性。

## TypeScript

| 阶段 | Errors |
|---|---:|
| Phase16A historical budget | 22 |
| Phase15 初始 raw tsc | 22 |
| 正常生成 Umi 类型后 | 4 |
| 最终原始检查 | 0 |

删除 typecheck-baseline.json 和 allow-budget 逻辑。CI 与 summary 强制 raw exit 成功、diagnostics=0。
没有 ts-ignore、扩大 any、排除源码或 tsconfig 放宽。旧 Diff Config 页最终因控制器已不存在而物理移除，不是错误基线豁免。

## Security

保留认证/授权、panel-only、Webhook/body limits、Git credential、路径、敏感文件权限和日志/响应脱敏边界。
Fresh 不再创建高权限 system App；真实用户 Apps 保留。旧任意 command-run/stop 与全局依赖/代码覆盖升级入口退出。
没有新增项目依赖、批量升级 lockfile、PAT、权限提升或生产部署修改。详见 `08-security-audit.md`。

## Scale

本地断言覆盖 5,000 Discovery files / 5,000 Cron / 20,000 Workspace files / 5,000 Git changes /
100,000 Runs / 100 MiB logs / 10,000 Outbox；Backup 也覆盖大型运行历史和日志。
这些是实际 fixture 大小，不是生产吞吐承诺。原始 TAP 保留时间/内存记录。

## Fresh Install / Restart

全新数据根、v9 schema、无旧 scripts/deps/dep_cache/config.sh 依赖；现有用户目录被保留。
真实初始化/登录、Credential/Repository/Worktree、Runtime/Environment、ENV/Config/Hook、Task/Trigger、执行/通知/编辑/备份由完整浏览器覆盖。
最终 restore/rebuild/browser gate 已通过。

## Tests

- 最后完成的全量回归：**385 tests / 385 pass / 0 fail / 0 skip**。
- 最终后端/前端构建、raw tsc（0 errors）与 CI 静态检查通过。最终前端使用已安装项目工具直接调用；本机默认 pnpm 版本不匹配，未重装依赖或改写锁文件。
- Darwin 未安装 ShellCheck；Bash syntax 通过。Ubuntu workflow 安装 ShellCheck 并严格要求成功。
- 完整 Workspace browser PASS；Backup/Restore browser PASS（含 10 轮 refs/prepare 竞争验证）。
- 原始失败记录与最终结果分开保存；没有加 retry/skip 隐藏失败。

## GitHub Hosted Qualification

- 新 run：未执行。
- 候选提交：以本报告所在 develop HEAD 为准；最终回复记录完整 SHA。
- Runner：要求 `ubuntu-24.04` / x64。
- Workflow：`.github/workflows/linux-qualification.yml`，复用 Foundation full，并独立执行 native/crash/scale suites。
- 结果：**GITHUB_HOSTED_QUALIFICATION_PENDING**。

## Artifacts

本地日志位于 `diagnostics/phase15/`。原始受管 fixture 在 ignored 私有工作目录；最终只发布通过既有 collector/canary 检查的证据包。
Collector canary/私钥扫描 PASS，owned root/process cleanup PASS，archive PASS。归档路径与 SHA-256 见 `diagnostics/phase15/artifact-receipt.json`；可提交的摘要在 `diagnostics/phase15/evidence/`。共享归档器沿用 phase16a 文件名前缀和入口 HEAD，证据明确标注 LOCAL_DIRTY_WORKTREE_DARWIN_NOT_HOSTED，不能冒充已提交或托管结果。

## Files Changed

主要变更：Trigger/Unix submission、旧入口和全局依赖删除、正式 retention/startup、订阅按钮状态、strict typecheck CI、Linux Qualification workflow、正式 Task/ENV/native 测试、schema/Workspace/Backup 相关旧测试迁移，以及架构/Phase15 文档。
详细文件与内容指纹见 `diagnostics/phase15/source-inventory.json`。GitNexus all/develop 两次审查均识别 223 个变更符号、18 条流程，评级 CRITICAL；覆盖 Execution/Task API/Trigger/Subscription/Retention，符合授权范围。索引截断且变更检测不完整覆盖未跟踪文件，因此结合独立文件清单和实测审查，不能宣称图谱完整。

## Schema

**v9 unchanged。** 无 migration/default/table-drop。历史持久化对象和用户目录不因源码清理被删除。

## Git

- Commit：主收敛提交 f61de1c1；最终门禁修正作为独立后续提交，不改写既有历史。
- Push：not performed。
- 无 tag、Release、Docker image、DockerHub token、PAT、write permission 或 deployment 修改。

## Final Gate

本地门禁：**LOCAL_CONVERGENCE_PASS**。
总状态：**PARTIAL / GITHUB_HOSTED_QUALIFICATION_PENDING**。
已知限制：本机 Darwin 无 ShellCheck；一次 restore rebuild 超时的根因未证实；新 Ubuntu 完整运行必须重新验证。Docker 模板尚未按新启动入口改造，本阶段未进行 Docker 资格认证。

## Next

由用户执行 `git push origin develop`，然后 Actions → Linux Qualification → Run workflow → develop。取得新 Run ID 后核查 jobs/logs/artifacts；未授权 push，本任务停在候选提交。
只有该 run 所有 gates 通过才可 Phase15 PASS。**Phase16B — Release Engineering 不自动开始。**

## Final Gate candidate audit

再次通过 backend/frontend build、原始 tsc 零诊断、static/bridge 与 qualification 汇总失败路径验证。Hosted socket 从单轮补齐为 10 个独立强制 suite，每轮 20 并发与 SIGKILL/restart；缺任意一轮结果必须 FAIL。这是 harness 覆盖补齐，未改产品实现。
