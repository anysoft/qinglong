# Phase 6 Status: PARTIAL

Phase 6 — Python Runtime Manager 已实现。平台管理 **CPython 可执行运行时**，独立于 Backend/System Python、Task 当前执行、venv 和包环境。本阶段未进入 Phase 7。

| Item | Status |
|---|---|
| Schema v3 | PASS |
| Runtime Domain | PASS |
| Pyenv Provider | PASS |
| Version Catalog | PASS |
| Python Install | PASS（含真实 CPython 3.13.15） |
| Runtime Verification | PASS |
| Runtime Removal | PASS |
| Runtime Repair | PASS |
| Operations | PASS |
| Lock / Recovery | PASS |
| API / UI | PASS |
| Browser Validation | PASS，671 HTTP responses / 22 WebSocket frames |
| Real Python Smoke | PASS，pyenv + CPython 3.13.15 install/verify/remove |
| Linux Validation | PARTIAL，尚无 Linux 实机结果 |

## Tests / Build / Typecheck

- 完整 release gate：**331 tests，328 passed / 0 failed / 3 skipped**。3 skips 是既有 macOS flock/cache 条件，没有归档、删除或扩大跳过旧测试。
- 新增 17 项确定性测试：Schema 3、Runtime 6、API 1、进程/失败 4、Provider 安全 3；原平台测试全部保留。多个测试内包含多步真实文件/进程/API 断言。
- Backend Build：PASS；Frontend Build：PASS。原有 bundle size 与 Browserslist 提示仍在。
- Typecheck：**53 项既有问题、0 新增**；raw tsc exit 2，回归预算 gate PASS，类型债务状态 PARTIAL。
- 生产静态审计：310 files、0 forbidden/unclassified、63 explained references。
- 证据：[release tests](diagnostics/phase6/platform-tests.log)、[backend](diagnostics/phase6/backend-build.log)、[frontend](diagnostics/phase6/frontend-build.log)、[typecheck](diagnostics/phase6/final-typecheck.json)、[static audit](diagnostics/phase6/final-static-audit.json)。

## Phase 5 Checkpoint

按请求先提交 Phase 5：`21e733fe`，`feat: phase 5 config assets and hooks v2`，tag `platform-phase5`。Phase 6 位于 `codex/phase6-python-runtime`，工作区变更可审阅；未推送或部署。Phase 5 报告/证据保留为历史记录。

## Database Changes

当前 Operational Schema 升到 **v3**，新增 RuntimeProviders、RuntimeInstallations、RuntimeOperations。每个 Provider、exact installation 和操作日志 identity 有唯一约束；语言/Provider/implementation/state/status/optype/cancel 有 SQLite 实际 CHECK，FK 使用 RESTRICT。

Phase 5 v2 fixture 已冻结在 `back/schema/platform-v2.json`，来源 checkpoint；未用新 ORM 重新定义 v2。valid v2 先验证冻结 model/schema signature，再事务迁移到 v3；fresh 与 migrated 最终签名一致。有效 v1 先使用冻结 v2 DDL 完成并验证原迁移，再同事务进入 v3。篡改/未知库 fail closed；DDL 早期和晚期故障回滚，保留 ENV/Config/Hook 数据且可重试。

实现中发现 Sequelize 会修改复用字段定义对象，已将每个日期字段改为独立定义，真实 ORM 生命周期与 Schema 测试均通过。

## Runtime Domain

RuntimeProviders → RuntimeInstallations；RuntimeOperations 持有资源操作历史，独立于 TaskRun/SyncRun。Installation 身份是 provider_id + CPYTHON + exact version；Catalog 不创建 Installation 行。

删除使用 REMOVED tombstone 保留历史，重新安装复用身份。当前无 RuntimeEnvironment、venv、package、Task/Hook Runtime 外键。`RuntimeReferenceService` 是引用来源扩展点，当前明确返回 0；Phase 7 必须接入真实 Environment 引用。

## Provider Model / Pyenv Architecture

平台私有 pyenv 位于 `runtime/python/pyenv`。官方来源固定为 https://github.com/pyenv/pyenv.git，release **v2.8.5**、revision **c293de3650a2d08ea36c5f6f0d55c5a3841b0c72**，上游查询证据保存在 [pyenv-source.json](diagnostics/phase6/pyenv-source.json)。

代码按 revision 存在 providers/，安装位于同级 versions/。Setup/Update/Repair 先临时 fetch 精确 commit、checkout/结构/HEAD/版本校验，再发布。Repair 只隔离旧 code，不替换或清除 versions。

使用官方 standalone `python-build --definitions` 与 `python-build -v EXACT PREFIX`，避免用户 pyenv hooks、shims、.python-version 与 shell 状态。无 pyenv init/global/local/shell/exec，没有可输入任意 upstream 的接口。Update 显式执行；安装不会自动更新 Provider。

## Python Catalog

Catalog 缓存到 Provider JSON + last_refresh_at/revision；GET 不联网。只展示精确 CPython 3.x.y stable，过滤 PyPy/Anaconda/预发布/dev/variant，去重并按数值排序。安装同时验证格式与 Catalog membership。

Catalog 是官方 definition 可用性，不保证所有历史版本能在当前 OS/SDK 编译；过旧版本不支持隔离验证参数时进入 ERROR，不冒充 READY。平台 pin 更新后显式 Update 才能取得新增 definitions，没有 latest 漂移。

## Install Lifecycle

Provider EX lease → 校验 Catalog/引用/状态 → DB QUEUED/INSTALLING → 私有 HOME/build env → 工具/空间诊断 → Provider integrity → owned installation root/sidecar → python-build → interpreter verify → DB READY/SUCCESS → 临时目录清理/lease release。

默认 4 jobs、3600 秒操作 deadline，服务端分别限制 1..16、1..7200。多个版本拥有独立目录；整个 Provider 保守串行，冲突立即 RUNTIME_BUSY。没有静默 `install -s` 或接管已存在目录。

## Verification

直接解析安装内绝对 interpreter，先 SHA256 检测已验证执行文件篡改，再以 `-I -S` 执行固定 JSON diagnostic：sys.executable/version/version_info/prefix/base_prefix、CPython implementation、OS/arch。

版本和实现必须吻合，executable/prefix/base_prefix 的 realpath 必须属于相应 owned installation。快照保存 Provider revision、build timestamp、版本文本、平台架构、hash、磁盘逻辑字节数。后续 Verify 保留原构建 revision/timestamp。没有任意 Python console。

磁盘用量仅在显式安装/验证后刷新，不在页面轮询中扫描；不跟随 symlink，最多遍历 250000 个 entries。

## Removal / Repair

Remove 在 lease 内再次检查引用，验证所有权与目录 inode 后删除并确认缺失。删除失败保留 Runtime ERROR 和外置 ownership，部分删除可重试。Provider code 损坏/网络不可用时，已有完整 Runtime 仍可直接 Verify/Remove。

Repair 显式把旧安装和 ownership 副本移入 operation 隔离区，再安装原 exact version；不自动删除隔离数据、不处理未知目录。没有 Provider Delete API，也没有 Provider Repair 连带删除所有版本的行为。

## Runtime Operation

长操作返回 HTTP 202 + operation ID；operation 独立管理 QUEUED/RUNNING/SUCCESS/FAILED/CANCELLED/INTERRUPTED、stage、起止时间、真实 command exit code、静态 error code。阶段来自实际工作步骤，没有假百分比。

流输出写独立操作日志，不塞进 SQLite。复用 UTF-8/backpressure/drain 与 redactor，日志约 16 MiB 上限（加截断标记），API 只读末尾 64 KiB。日志故障终止进程，超限后继续 drain。临时清理失败留下 CLEANUP_REQUIRED/RUNTIME_CLEANUP_FAILED，保留未知内容供核对。

## Filesystem

| 相对 DATA_DIR | 责任 |
|---|---|
| runtime/python/pyenv/providers/REV | pinned Provider code |
| runtime/python/pyenv/versions/EXACT | owned interpreter |
| runtime/python/pyenv/ownership/runtime-ID.json | ID/version/dev/ino ownership |
| runtime/python/quarantine/operation-ID | Repair 旧数据隔离 |
| cache/runtime/python/downloads | 可重建源码缓存 |
| tmp/runtime/python/operation-ID | 私有 HOME、build、temp |
| log/runtime/runtime-operation-ID.log | bounded operation output |
| .locks/runtime-provider-ID.lock | 稳定跨进程锁 inode |

RuntimePathResolver 逐级拒绝 symlink/特殊文件/路径穿越/异常 owner。bin/python 可链接到安装内部普通可执行文件，禁止逃逸。未知版本目录只报告 orphan，不扫描宿主 Python 加入管理。没有读写 scripts/deps/dep_cache，没有修改系统/profile/Backend Python。

## Lock Ordering / Crash Recovery

Provider flock → 短 DB transaction → Runtime filesystem/command → 短 DB transaction → cleanup → close。不持有 B17、Config、Worktree 或 Task execution lease。

Node 打开稳定锁 inode，固定 Python helper 对共享 FD 获得 flock，FD 传给 supervisor 与子进程。Backend SIGKILL 后只要活跃子进程仍持锁，另一个 Backend 就不能接管；supervisor 监视父 stdin EOF 并收敛进程组。

启动仅查询未完成操作，尝试取得 Provider lease：busy 不动；成功标记 INTERRUPTED/ERROR，保留文件，等待显式 Verify/Repair/Remove。之后每秒仅检查 pending operations；不启动 Python 验证/编译/网络刷新。

取消通过数据库 cancel_requested 通知所有者，所有者只信自己持有的 ChildProcess。TERM process group → 2 秒 grace → KILL → wait/reap/drain。旧 owner_pid 不用于发信号，PID reuse 测试与真实 SIGKILL 后子进程/锁测试通过。

## Build Environment / Security

Build env 从空对象构建，只加入固定工具 PATH、私有 HOME/TMPDIR、locale、Provider/cache/build 路径、jobs、Git 隔离项和 PYTHONNOUSERSITE。没有继承 Backend/Task/Config/GitCredential secrets、PYTHONPATH/PYTHONHOME、NODE_OPTIONS、用户 pyenv 选择项。

Git 使用官方公开 upstream，不使用 Repository Credential；禁用 system/global config、helper、hooks 和交互。Python verify 使用 -I -S，不加载用户 sitecustomize。源码/工具会使用宿主已安装开发库，但 Manager 不执行 apt/brew/apk 安装。

API 拒绝未知字段、任意 command/path/source/mirror/proxy/environment；Open 路径明确拒绝，沿用面板登录认证。操作 DTO 不暴露 owner token/PID、完整 env 或内部日志路径。解析/服务错误只返回静态代码；已知 Backend secret 与私有 HOME 跨块脱敏。

## API Changes

面板 API 基址 `/api/runtime/python`：

- GET provider/catalog/installations/diagnostics。
- POST provider/setup、update、verify、repair、catalog。
- POST installations（exact version）；POST installations/:id/verify、repair；DELETE installations/:id。
- GET installations/:id/references。
- GET operations、operations/:id、operations/:id/log；POST operations/:id/cancel。

异步操作返回 `{code:200,data:{id,...}}`，HTTP 202。错误使用 400/403/404/409/500 与静态 message。无新增系统白名单接口。

## UI Changes / Browser Validation

导航新增 Runtime · Python，页面 `/runtime-python`。包括 Provider metadata/actions、cached exact catalog 安装框、jobs/timeout、installation state/health/time/size、verify/test/details/references/repair/remove、operation history/live log/cancel、工具/磁盘/orphan 诊断。

当前静态资源使用相对路径，多层 URL 会导致浏览器空白；页面采用与现有项目一致的单层路由。取消仅刷新操作状态，不重新打开已关闭弹窗。没有新增 Task 或 Hook Runtime selector。

真实浏览器覆盖 fresh 初始化登录、Credential/Repository/Worktree/Subscription、Scoped ENV、Config revisions/Secret、四阶段 Hooks、三语言执行、Runtime 生命周期、取消与重启后删除、重新执行 Task 与 Secret HTTP/WebSocket 审计。Browser provider 明确是确定性 fixture，不作为真实解释器证据。

浏览器脚本对原有仓库诊断锁的明确 REPOSITORY_BUSY 做有限重试，对异步操作以弹窗 ID 等待终态。最终细节见 [browser evidence](diagnostics/phase6/platform-e2e.json) 与 [截图](diagnostics/phase6/browser-runtime-python.png)。

## Real Runtime Validation

独立真实脚本使用生产 PyenvProvider，官方 pinned pyenv 已完成 fetch/verify/catalog。CPython 3.12.12 实际编译到 make install，标准库 ensurepip 进程在当前 macOS 26.6.2 发生 SIGSEGV（make Error 139），操作正确 FAILED，未持久化 READY；根因尚未证实。原日志完整保存在 real-smoke-python-3.12.12。随后精确 **3.13.15** 真实 install → READY/HEALTHY → verify → remove 全部 SUCCESS，4 个操作 exit 0，最终 remaining=0；没有使用宿主解释器冒充 Installation。

成功构建宿主 Darwin arm64、Clang 21.0.0，Runtime 逻辑用量 249145866 bytes。运行时 version/implementation/prefix/base_prefix/实际 executable 与 SHA256 均通过校验。成功 smoke 从 2026-09-15T15:43:04Z 到 15:45:32Z；官方源码预置缓存 SHA256 为 `1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76`，与 [pinned pyenv definition](https://raw.githubusercontent.com/pyenv/pyenv/v2.8.5/plugins/python-build/share/python-build/3.13.15) 一致。缓存中只有源码，编译、安装、验证、删除均走生产服务。

证据：[成功 result](diagnostics/phase6/real-smoke/result.json)、[真实安装日志](diagnostics/phase6/real-smoke/operation-2.log)、[真实验证](diagnostics/phase6/real-smoke/operation-3.log)、[真实删除](diagnostics/phase6/real-smoke/operation-4.log)、[3.12.12 失败记录](diagnostics/phase6/real-smoke-python-3.12.12/result.json)。

## Platform Regression / Linux

既有 Config snapshot、Hook lifecycle、B17、锁/lease、Secret、Schema v1 演化与三语言 Task 行为均继续回归。静态 protected-file diff 确认 Task/Hook/Config/Dependency 核心执行文件相对 platform-phase5 无变更。

本机 Darwin arm64。GitHub API 查询 workflow runs 返回 total_count=0，没有可用 Linux 实机记录。Validate workflow 保留全部回归/Browser，新增 Ubuntu real-python-runtime 独立 job；本次未 push/dispatch，**Linux 保持 PARTIAL**，不能将 macOS PASS 替代 Linux PASS。

## Temporary Bridges

B01/B02/B03/B04/B06 SDK+依赖+账号+信号/B07 Discovery Adapter/B08–B10/B11 内部设置/B12–B17 按原责任保留。B05 不恢复。重点：B02 当前 Python 执行、B06 preload、B09 dependency subsystem、B10 deps/dep_cache、B17 工作区/Config lease 均未退出。

未新增 Task bridge。Runtime 的 `runtime_lease.py` 唯一消费者 RuntimeLease，使用固定 `/usr/bin/python3 -I -S` 作为 flock helper，并复用已有通用 `hook_process.py`/`process_group.py`。原因、消费者与 Phase 10 通用监督层整合退出条件已登记 [TEMPORARY_BRIDGES.md](TEMPORARY_BRIDGES.md)。

## Important Findings

- Interpreter Resource 与 Environment 必须分开：CPython 标准 ensurepip 可能存在，但 Phase 6 不管理 shared packages。
- Provider code 与 versions 分离，才能安全 Repair Provider 并保留已有 Runtime。
- 外置 ownership sidecar 保留部分删除后的身份，inode 检查阻止接管替换目录。
- 进程组监督必须继承实际 lease，不能仅靠 owner_pid 或 Backend 内存 mutex。
- GitNexus 将全量变更标为 CRITICAL，已报告。完整 structured review 保存全部 changed symbols/flows；索引仍有 entry-point/callee 预算限制，不能宣称图覆盖完整。人工边界审计与动态测试补充，详见 [graph review](diagnostics/phase6/GRAPH_REVIEW.md)。

## Known Limitations

- Linux 实机 CI 尚未运行；全量 Typecheck 原有 53 项债务未清零。
- 当前 macOS 26.6.2 上 CPython 3.12.12 的 ensurepip 曾 SIGSEGV；3.13.15 完整通过。未将该单机现象推断为所有宿主的通用版本限制。
- 只支持当前 pinned pyenv；新定义需平台更新 pin 后显式 Update。Catalog 不保证所有历史 CPython 在当前 SDK 可构建。
- 固定 POSIX helper 需要 `/usr/bin/python3`；平台不自动安装 OS 开发依赖，不接受任意代理/镜像配置。
- Verify 检查解释器 hash/identity/metadata，不是整棵标准库与外部动态库的内容证明；不承诺二进制跨机器可移植。
- 创建根到 sidecar 发布之间异常中断可能留下未知目录；fail closed，人工核对，不自动 adopt/delete。
- Repair 隔离区与操作历史无自动清理/保留策略；日志单文件有上限。已有 Backup bridge 不承诺完整备份新 Runtime 与所有工作区数据。
- 防御客户端路径/链接攻击与无意外部修改；不宣称防御同 UID 持续恶意目录竞争。
- Runtime 暂无实际 Environment/Task 引用源；Phase 7 必须补真实引用与删除互斥。

## Phase 7 Preconditions / Recommended Next Phase

推荐下一阶段：**Phase 7 — Python venv + Dependency Environment**。先建立 RuntimeEnvironment → Runtime 引用、Environment 独立目录/锁/操作、pip/requirements/pyproject 与隔离契约，再评估 B09/B10 对应退出 gates。Task binding、Node Runtime、Runner v2 不提前进入本阶段。

**Phase 6 结束后 STOP，等待下一阶段指令。**

详细设计与测试记录：[docs/refactor/phase6](docs/refactor/phase6/01-runtime-domain.md)，架构图：[Python Runtime](docs/architecture/10-python-runtime.md)。
