# Phase 10 Status: PARTIAL

本阶段已切换到统一的 Runner v2。最后一批 Linux 进程组 / flock / FD 恢复材料的物理删除为 **BLOCKED_BY_LINUX_GATE**；本机为 Darwin，没有可用容器、VM 或本任务配置的远程 runner。不将 CI 配置当作 Linux 运行证据。

| Item | Status |
|---|---|
| Schema v7 | PASS |
| TaskRun Core | PASS |
| Execution Resolver | PASS |
| ExecutionContext | PASS |
| Worktree Execution | PASS |
| Python Runner | PASS |
| Node Runner | PASS |
| TypeScript Runner | PASS |
| Shell Runner | PASS |
| ENV Snapshot | PASS |
| Config / Hooks | PASS |
| Retry | PASS |
| Concurrency | PASS |
| Cancellation | PASS |
| Crash Recovery | PASS |
| Execution Result | PASS |
| Bridge Removal | PARTIAL |
| Browser Validation | PASS |
| Scheduled E2E | PASS |
| Linux Validation | PARTIAL |

以下 PASS 表示本次 Darwin、本地真实 managed Runtime 和指定故障注入范围通过；Linux 独立限制始终适用。

## Database Changes

数据库从真实冻结 v6 事务升级到 v7；新增 TaskRuns、TaskRunAttempts、索引、状态/字段触发器、活跃 Task 删除保护及 Worktree execution 引用保护。fresh 与 migrated schema 一致，晚期 DDL 故障回滚后可重试，旧 Task/Secret 不丢失。冻结签名见 [schema 文档](docs/refactor/phase10/12-schema-v7.md)。

## TaskRun Core

提交立即持久化 QUEUED 或 SKIPPED，Attempt 唯一键保证次数唯一。Run owner FD lease + SQLite IMMEDIATE 条件 claim 防止两个 Backend 同时执行。活跃记录不是内存 Map 的附属物。Task 删除后保留终态历史与日志。

## Execution Resolver

复用 Phase 9 TaskResourceResolver 的资源选择和 READY 校验；事务快照 → Worktree/Build lease → 重读复核 → immutable Context。执行时不反读 command、cron、staging 路径选择资源。

## ExecutionContext

纯数据递归冻结，完整 ENV/Config/Hooks/args/Settings/source/runtime 保留在内存。FD、process handle、取消和 redactor 状态分离；数据库 metadata 只保存版本、ID、checksum 和依赖 hash。

## Snapshot Semantics

同一 Run 的 retry/backoff 不重新 resolve。Task/ENV/Config/Hook/Environment 修改仅影响后续 Run。每 Attempt 从原 ENV 开始，前次 Hook patch 不残留；redactor 跨 Attempt 保留已登记 Secret。

## Worktree Source Execution

直接运行 RepositoryPathResolver 生成的规范 Worktree 路径；入口与 cwd 先校验，源 checksum 入 metadata。TaskExecutionSourceBridge 只生成 ID launcher 投影，不再刷新 staging 来运行。编辑器/订阅发布的 staging 职责保留。

## Python Runtime Binding

使用真实 managed CPython 3.13.15 的 pinned venv/bin/python，实际导入 wheelhouse 安装包。Runtime/Build 生命周期沿用 Phase 7 的引用和租约，禁用 host PYTHONPATH/PYTHONHOME/user-site 注入。已验证 Build 推广后旧 Run retry 仍用旧 Build。

## Node Runtime Binding

使用官方 Node 24.21.0 + immutable Environment Build；持有 Build、Runtime、Toolchain pins。实际 CJS/ESM import、Build 推广/重试、定时、超时和取消均有真实执行证据。不使用系统 Node 回退或 NODE_PATH。

## TypeScript Execution

实际安装并运行 tsx 4.20.6，使用 pinned managed Node + Build 内真实 CLI。没有 npx 下载或 TS-as-JS 伪执行；缺 tsx 在 Attempt 前失败。手工、node-schedule adapter、crond launcher 路径均验证。

## Shell Execution

固定 /bin/sh，以 argv 数组传入口和参数。含空格、分号、百分号、美元符号/命令替换文本的入口/参数不被 Shell 拼接解释。解释器不是 Bash；脚本需符合自身明确的 Shell 约定。

## ENV

复用 Global → Repository Profile → Task 解析及 UNSET。MAIN 环境从完整快照构造，不继承 Backend Secret；仅基础 PATH、LANG 和平台保留字段。新 Runner 不写 environment.sh / generated language ENV。

## Config

固定不可变 revision，复用 ConfigMaterialization prepare/cleanup/recover、journal 和 REPLACE_RESTORE 语义。保留 .git、node_modules、.platform 路径，不允许 Config 改变模块解析。

## Hooks

复用 BEFORE → MAIN → AFTER_SUCCESS/AFTER_FAILURE → FINALLY；BEFORE 输出先缓冲，协议解析与 Secret 登记后再写日志。无效协议不自动重试。Hook 命令和 JSON 输出位于 0700/0600 私有目录，每 Attempt 后清理已知文件。

## Workspace Materialization

Worktree 根临时 node_modules 链接指向 pinned Build，使用 staging、journal、ino/dev 身份和排他链接安装。扫描 Worktree 内已有模块树，冲突失败关闭。未知替换文件和 Config backup 保留，不以递归删除换取成功。

## Runtime Leases

Run owner EX、Worktree EX 与 Runtime Build shared leases 贯穿执行；用于材料化的 helper 与 Hook/MAIN supervisor 都继承 FD。资源释放在子进程组终止、日志排空、恢复清理后执行。

## Retry

max_attempts 是总尝试次数；固定/指数延迟上限 3600 秒。只重试普通退出/监督超时/Hook 执行失败且 cleanup 成功的结果。协议、安全、取消、中断、恢复冲突不重试。

## Concurrency

FORBID 返回持久化 SKIPPED；QUEUE FIFO；ALLOW 可并行不同 Worktree，同一 Worktree 因独占材料化而串行。跨进程真 worker 验证一次 claim/一次 MAIN。单 dispatcher 最多 8 个活跃 Run。

## Queue

队列持久化在 TaskRuns；重启保留 QUEUED，资源 busy/快照变化重新排队。正在 recovery 的同 Task 阻止继续 claim。Queued cancel 不创建 Attempt。

## Timeout

复用 POSIX supervisor 的 deadline，结构化结果 FD 区分真实 exit 124、TIMEOUT、signal 与 CANCELLED。Python/Node/Shell 均验证，Hook deadline 与 MAIN timeout 独立。

## Cancellation

API 按 Run ID 持久化 cancel_requested，并通知当前拥有者；backoff 可立即打断。FINALLY/CLEANUP 继续执行，已完成 Run 不被后来的 cancel 改写。旧 stopInstance API 已禁用按 stored PID 发信号。

## Process Supervision

保留并复用 hook_process.py / process_group.py，而非重写 process-group/descendant 算法。增加独立 result FD，沿用 stdin EOF 后代回收与 FD 继承。HTTP worker graceful shutdown 先关闭提交入口、等待正在进行的 dispatcher claim 完成、取消/等待执行，再退出服务；竞态故障注入测试验证不会漏掉刚获得所有权的 Run。

## Crash Recovery

恢复者必须获得 owner EX，不能仅凭 DB PID/时间判断。再取得 Worktree EX，恢复 Config journal 和 Node binding，清理已知私有文件，将未完成 Run/Attempt 标为 INTERRUPTED。未知文件 → RECOVERY_REQUIRED。SIGKILL 独立 worker 后验证 descendants 收敛、Config 原值恢复与队列保留。

## ExecutionResult

状态、attempt、开始/结束/耗时、真实 exitCode/signal、timeout/cancel、primary/secondary errors、Hook results 与 cleanupResult 统一为结构化结果。Skipped、queued cancel、resolve fail 和 recovery 也有 canonical result。cleanup 冲突不能 SUCCESS；错误只存安全 code，不存异常全文/Secret。

## Notifications

达到最终结果、完成 AFTER/FINALLY/CLEANUP 后先落库，再按执行快照策略调用现有 NotificationService。多次 Attempt 不多发成功通知，发送失败加入 secondaryErrors，不把已成功 MAIN 改成失败。本阶段没有 Phase 13 outbox/通知投递保证。

## Logs

每 Run 独立 data/log/task-runs/run-ID.log，0600/no-follow，按顺序写入并排空；复用 run-wide redactor。API 返回最后 4 MiB，并避开截断 UTF-8 码点。真实大日志、跨 chunk Secret、Unicode、生成 Secret 均验证。

## Scheduler Integration

node-schedule 的 runCron 忽略旧 command，仅提交 Task ID。system crond 只调用固定绝对 backend Node、taskRunSubmit.js、private socket、Task ID。socket 目录 0700、socket 0600、同 UID，协议仅数字 ID；没有 token/ENV/源码命令拼入 crontab。Darwin 已真实执行 launcher，Linux crond daemon gate 尚缺。

## Manual/API Execution

Tasks UI Run、Runs/history、Log、Cancel 走统一 TaskRun API。旧 Script debug/stop 返回 Task-required，编辑器引导至 Tasks，不保留另一条 raw-command 正常执行路径。

## Legacy Bridge Removal

B02/B06/B08/B17 退出正常 Task 路径，旧 Shell/CLI 默认拒绝，显式恢复诊断保留。B01/B03/B04/B09/B10/B14/B15 缩减职责；bootstrap、编辑器、Linux packages、显式 SDK、历史/订阅数据不误删。完整 current consumers 与 exit gates 见 [TEMPORARY_BRIDGES](TEMPORARY_BRIDGES.md#phase-10--execution-engine)。

## Security

无 Shell MAIN 拼接、系统语言 Runtime fallback、全局 dependency injection、Shell→Open API result loopback。TaskRun 不持久化 ENV/Config Secret；私有协议目录按 ownership marker 清理。恶意/不明替换文件保留并阻止自动重试。平台不是对同 UID 恶意脚本的通用 OS sandbox；外部任意写入不承诺可隔离。

## Linux Gate

Step 0 在编码前检查：Darwin，无 docker/podman/limactl/colima/gh，也无本任务 runner 配置。记录 [linux-step0.json](diagnostics/phase10/linux-step0.json)。Linux workflow 已更新到 Phase 10 provision/managed execution/browser/typecheck/static audit，但未运行；旧进程/锁恢复材料 destructive removal 保持 BLOCKED_BY_LINUX_GATE。

## Platform Regression

最终单测、构建、真实 Runtime 与浏览器结果见下方验证汇总。两个只验证旧 PID/token claim 的测试已在 manifest 明确 ARCHIVED_LEGACY，并由 durable TaskRun claim/cancel/recovery 测试替代；旧 ENV/Config/Hook 协议测试通过显式诊断入口继续运行。未把失败测试静默跳过。3 个 skip 是既有 node-path-cache 测试因 Darwin 无 flock CLI 而跳过；Runtime FD/flock 通过 Python helper 的独立测试并不替代这 3 个 Linux gate。

## Known Limitations

Linux 实机 gate 未执行；最后 legacy 恢复源码未物理删除。Typecheck 仍有 34 个既有诊断、0 新增，不能称 raw tsc 全通过。shellcheck 在本机不可用，已做 bash -n 与真实 Shell/故障注入测试。相同 Worktree 不并行材料化；TaskRun log API 当前为有限尾部读取。通知不提供持久化 outbox/exactly-once delivery，符合 Phase 13 未开始的边界。

## Important Findings

真实 tsx 安装暴露 npm ls 对省略 optional 平台包返回空对象的既有验证问题，已仅对 lockfile 声明的 optional dependency 接受占位，required dependency 仍严格验证。Darwin Unix socket 路径限制促使采用基于 dataRoot hash 的短私有地址。exit 124 不能等同 timeout，新增结构化 supervisor 结果区分。恢复测试的诊断标志必须经过旧 ENV isolation 白名单，而产品入口保持默认禁用。

## Phase 11 Preconditions

可进入定义设计前，应先在真实 Linux 执行已配置 gates，取得 flock/process-group/SIGKILL/crond/managed Python/Node/TS 证据，再审核最后旧执行材料物理删除。下一阶段建议 Phase 11 — Discovery v2 + Trigger Model。本次停在 Phase 10，没有实现 Phase 11/13。

## 验证汇总

最终数字由 diagnostics/phase10/verification-summary.json 汇总，详细过程与失败修复日志均保留。最终平台日志为 platform-tests-final.log；浏览器为 platform-e2e.json；不累计重复运行的同一测试。

| Gate | Result |
|---|---|
| Platform tests | 374 passed / 0 failed / 3 skipped; supplemental policies 2 passed / 0 failed |
| Actual managed Python / Node / CJS / ESM / TS | 2 passed / 0 failed |
| Previous Python/Node managed lifecycle | 3 passed / 0 failed |
| Backend / Frontend build | PASS / PASS |
| Typecheck | 34 existing / 34 remaining / 0 new；regression PASS |
| Browser fresh + restart + run/log/cancel | PASS |
| Static audit | PASS；349 production files，0 forbidden，82 classified references |
| Linux | PARTIAL / BLOCKED_BY_LINUX_GATE |

## GitNexus 影响与范围

所有生产符号修改前运行 upstream impact，HIGH/CRITICAL 已告知。最终索引包含新执行模块；detect_changes 分别比较 HEAD 与 develop。develop 包含此前多阶段重构，不能将其全量变化归因本 Phase。图谱存在跨语言缺边与流程预算截断，UNKNOWN 不等于没有消费者；结合直接入口、源代码审计和真实执行验收。HEAD 范围报告见 verification-summary.json 的 gitnexus 字段；touched symbols 包含格式整理与测试、文档符号，不等于行为改动数量。develop 为跨阶段基线；放宽工具的输出列表上限后保留完整报告，未修改工具分析算法或已安装工具。

## 交付物

[13 份 Phase 10 文档](docs/refactor/phase10/01-execution-engine.md)、[当前架构图](docs/architecture/14-execution-engine.md)、[桥接登记](TEMPORARY_BRIDGES.md)、[静态审计](diagnostics/phase10/final-static-audit.json)、[完整验收证据目录](diagnostics/phase10)。分支 codex/phase10-execution-engine；未 commit / push / deploy，未删除用户数据。

## Fixture 清理

本次真实 managed Python/Node 测试根已通过正式 VERIFY/REMOVE 操作释放 Runtime、Toolchain 与 Environment，再删除经路径/ownership 校验的隔离根。首次 source-cache miss 的专用临时根也已校验并删除；操作日志保留在 diagnostics/phase10，未触及用户数据库和 Worktree。清理证据：[cleanup-result.json](diagnostics/phase10/cleanup-result.json)。
