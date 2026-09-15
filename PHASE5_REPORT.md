# Phase 5 Status: PARTIAL

本阶段已实现 Config Assets + Hooks v2，保留现行 Task/Scheduler/Runner bridge。Linux 实机验证仍为 **PARTIAL — CI pending**；Git helper 的 macOS 进程组清理竞态已定位并修复，见 Important Findings。不以 macOS 结果代替 Ubuntu 验收。未开始 Phase 6。

| Item | Status |
|---|---|
| Schema v2 | PASS |
| Config Assets | PASS |
| Revisions | PASS |
| Repository Bindings | PASS |
| Task Bindings | PASS |
| Materialization | PASS |
| Recovery | PASS |
| Hooks v2 | PASS |
| Hook Env Patch | PASS |
| Secret Handling | PASS（权限与脱敏边界见下文） |
| API / UI | PASS |
| Fresh E2E | PASS |
| Browser Validation | PASS |
| Linux Validation | PARTIAL — CI pending |

## Tests / Builds / Typecheck

- Platform Tests：311 passed / 0 failed / 3 skipped（314 tests）；所有 Phase 5 测试已纳入正式发布 manifest，未通过归档或新增跳过隐藏失败。跳过项为既有 macOS flock 缺失相关的三项缓存互斥测试，Config 的 POSIX Python 租约测试实际执行。最终日志：`diagnostics/phase5/platform-tests.log`。
- Backend Build：PASS，`diagnostics/phase5/backend-build.log`。
- Frontend Build：PASS，`diagnostics/phase5/frontend-build.log`。
- Typecheck：新增错误 **0**，回归门禁 **PASS**；原有错误由 54 降至 **53**，完整 tsc 仍退出 2，因此原始类型检查为 **PARTIAL**。证据：`diagnostics/phase5/final-typecheck.json/log`。
- Static Audit：PASS；294 个生产文件，0 个未解释/禁止命中。旧字段只允许冻结 v1 模型、迁移和 protobuf 保留标签等明确分类。证据：`diagnostics/phase5/final-static-audit.json`。
- Fresh Platform / Browser E2E：PASS。空 DATA_DIR → 初始化/登录 → SSH Credential → Repository → Subscription/同步/发现 → ENV → Config/revision/Secret Keep → Repository Binding → Task override/MASK/preview → 四阶段 Hooks → Python/Node/Shell 运行及日志 → 重启/重新登录/再次执行 → v2/FK 检查。真实页面操作，21 个验收步骤；检查 **491 个 HTTP 响应、20 个 WebSocket 消息**，未出现测试 Secret。额外验证运行期间 Script 读取/下载被拒绝。证据：`diagnostics/phase5/platform-e2e.json`、`browser-*.png`。
- Linux：当前主机 Darwin ARM64，无可用 Docker/Podman/Colima/Lima。Ubuntu workflow 已增加 Phase 5 锁、symlink、权限、原子安装、恢复和浏览器 gate，尚无本轮 CI 执行结果。

## Database Changes

`platform_schema_version=2`。从 Phase 4.5B 基线提交 `9a9ad297` 固定 v1 元数据与建表 SQL，保存于 `back/schema/platform-v1.json` / `platformV1.ts`；未重定义 v1 signature。

迁移先严格验证已知 v1 签名，在 SQLite IMMEDIATE transaction 内创建五个新表、转移旧 Task Hooks、删除旧字段、更新版本，并验证前后外键。Fresh v2 与 migrated v2 最终签名一致。测试覆盖早期 DDL 失败和 DROP COLUMN 后失败的完整回滚、重试、重启及数据保留；未知库、QingLong 库和旧 checkpoint 均 fail-closed。

新增 `ConfigAssets`、`ConfigAssetRevisions`、`RepositoryConfigBindings`、`TaskConfigBindings`、`TaskHooks`。资产/revision/Repository 引用受 RESTRICT 保护；Task 的 bindings/hooks 属于 Task，使用 Crontabs bridge FK + CASCADE。索引约束同 owner/target 唯一及同 task/phase/position 唯一。

有效平台 v1 的 Task before/after 转为 BEFORE/FINALLY，failure policy 为 CONTINUE，以保留 v1 的非致命执行语义；Subscription before/after 删除，不再引入订阅 Hook 生命周期。

## Config Asset Model / Revision Model

资产是独立于 Git、ENV、平台 Settings 的持久化资源；编辑不会提交或写入 Git。名称仅为展示字段，物理 identity 使用 ID。正式支持 TEXT（有效 UTF-8、最大 1 MiB），content_type 保留未来扩展空间；本期不提供 BINARY 产品能力。

每次内容修改创建独立 revision，记录 checksum/size/storage_key，禁止原地改写 current 内容。0700 私有目录、0400 canonical 内容；独占目录创建、临时写入/fsync/原子 rename 后事务更新 current pointer。失败仅清理本次拥有的临时资源，保留既有数据；磁盘孤儿占用的 revision number 跳过，允许编号空洞。

元数据、绑定和 Hook 编辑有 expected_version 乐观锁。Secret 只可 Keep/Replace/Delete，不返回旧正文，也不能降级为非 Secret。公开 GET/content 对 Secret 拒绝；无任意 revision 删除接口。解绑后允许删除资产元数据，但保留未引用 canonical 内容，等待未来 GC。

## Binding Resolution

Repository ATTACH 默认绑定 → Task ATTACH override / MASK；以 target_base + normalized target_path 为唯一 key。disabled 不参与，MASK 显式去掉继承。preview 只返回 revision/来源/目标/策略等元数据。

PREPARE 用同一个数据库读事务冻结 Task、ENV、Config revisions、Hook plan，正在运行的任务继续使用旧 revision，下一次执行读取新内容；测试包含同时修改 ENV、Config 与 Hooks 的运行隔离。

Repository 删除诊断统计 Config references，绑定仍在时拒绝删除；DELETING Repository 不接受新绑定。Task 发布失败的补偿保留原 Task 子资源：调度器更新成功后才最终删除被移除 Task，避免 FK CASCADE 提前丢失 ENV/Config/Hooks。

## Materialization / Workspace Locking / Crash Recovery

Config Domain 只接收 TaskWorkspaceResolver 的 workspaceRoot/taskDir/cwd/resourceKey；scripts 路径映射集中在 B17。支持 WORKSPACE_ROOT/TASK_DIR、COPY/SYMLINK、默认 FAIL_IF_EXISTS、显式 REPLACE_RESTORE。SYMLINK 指向 per-run 私有副本，绝不直连 canonical revision；writable 修改不会自动写回资产。

路径规范化并检查所有父级 lstat、根边界，拒绝绝对路径、`.`/`..` 非法片段、NUL、无效 UTF-8、超长路径、`.git` 和内部保留目录；已有 symlink/特殊文件拒绝替换。journal 恢复也重新校验 taskDir 与根边界。安装使用独占 hardlink 避免检查后覆盖竞态；macOS 上 SYMLINK 使用 Python `os.link(..., follow_symlinks=False)`，避免 Node link 跟随 symlink。

跨进程 POSIX 租约顺序为现有全局 publication-1 SH → 配置内容访问 SH（配置运行需要时）→ workspace 配置 EX/SH。有 workspace mutation 时 EX 覆盖 materialize、全部 Hooks、MAIN、恢复/清理；同 workspace BUSY，不同 workspace 可并行。无配置任务也遵循 workspace 读租约，避免读取其他执行的瞬态配置。全局 publication 锁与既有发布器使用同一个 key，防止执行过程中脚本被发布替换。

REPLACE_RESTORE 先持久化 journal、原始 inode/dev/mode/checksum，再原子移入私有 backup。恢复只删除本执行安装且 identity 匹配的文件，按原字节和 mode 恢复；未识别文件、篡改或冲突保持原状并报 CONFIG_RECOVERY_REQUIRED。SIGKILL 后下次 workspace EX acquire 恢复 stale journal；拿到 SH 后发现新 journal 时仅内部升级重试一次。测试验证真实杀进程、锁释放、下一执行恢复及未知文件保留。

## Hook Model / Lifecycle / Failure Semantics

结构化 TaskHook 包含 phase、command、cwd_base、position、timeout、failure_policy、enabled、version。四阶段只接受 BEFORE、AFTER_SUCCESS、AFTER_FAILURE、FINALLY；同阶段按 position 稳定排序，reorder 在事务内处理。

生命周期：PREPARE → materialize → BEFORE → 当前 MAIN runner → AFTER_SUCCESS/AFTER_FAILURE → FINALLY → 平台 cleanup。

- PREPARE 失败：只做平台 cleanup，不启动用户 Hook/MAIN。
- BEFORE FAIL_EXECUTION：停止剩余 BEFORE、跳过 MAIN，进入 AFTER_FAILURE、FINALLY。
- MAIN 非零/超时/优雅取消：AFTER_FAILURE、FINALLY；成功：AFTER_SUCCESS、FINALLY。
- AFTER_SUCCESS 失败不跳转 AFTER_FAILURE。AFTER/FINALLY 尝试全部配置 Hook；policy 决定是否使整体失败。
- 第一项致命失败保留为 primary，后续失败追加，不覆盖主错误。CONTINUE 记录失败但允许生命周期继续。
- 默认 BEFORE/AFTER_SUCCESS/FINALLY 为 FAIL_EXECUTION；AFTER_FAILURE 为 CONTINUE。
- 每个 Hook 独立 1–3600 秒 timeout，通过 POSIX 子进程组 TERM/KILL 收敛后代，租约保持到收敛。

Config 在 FINALLY 结束后才清理。SIGTERM/正常失败/timeout 尝试用户 FINALLY；SIGKILL、内核故障与断电无法保证用户 FINALLY，平台 recovery 另行负责。

## Hook Output Protocol

BEFORE 独占的 `PLATFORM_HOOK_OUTPUT` 接受严格 JSON environment set/unset/secret；仅作用于本次 derived ENV snapshot。禁止修改 Backend process.env 或 Global/Profile/Task 数据库，不解析 stdout 为 ENV，也不执行返回值。

JSON 最大 64 KiB；set/unset 操作与 secret 数量各受 128 上限约束，变量值/完整 ENV 受运行平台字节预算限制。非法 JSON、未知操作、非法/保留变量、超限以及原型继承属性均作为 Hook failure。非 BEFORE 不能产生 ENV patch。

原始 preparation 保持不可变，派生 environment.sh/snapshot.json 私有原子更新；动态 Secret 先加入脱敏器，再放行 BEFORE 暂存日志。无法验证的输出不释放可能含新 Secret 的原始缓冲。

## Secret Handling / Security

Secret ENV、Config 完整正文与 Hook 声明的生成 Secret 加入统一 streaming redactor，覆盖 UTF-8 分片、跨 chunk、常见编码及既有账号模式，更新后也保留历史 Secret 值。Hook command 本身不被当作 Secret，应通过 ENV/Config 传递机密。日志有阶段标签，不记录完整命令或配置正文。

公开资产列表/revisions/usage/preview/error 不含 Secret 正文。新增 Script 内容访问 guard：配置执行持 SH；Script API 操作持 EX，并检查 stale journal，锁保持至业务动作和 HTTP 响应都结束。阻止 COPY 注入的 Secret 被现有 Script GET/download 旁路读取；这是保守的全局内容互斥，不是新编辑器。

At-rest encryption 仍是未来安全能力；当前为 plaintext + 严格权限。相同 OS 用户运行的恶意代码不属于只读 mode 可隔离的安全沙箱；精确 Secret/常见编码脱敏不等于对任意字段拆分、变形或外发的 DLP 保证。

## API Changes / UI Changes

新增 `/api/config-assets` 资产、revision、content、usage 接口，以及 Repository/Task config-bindings、Task config-preview/context、hooks CRUD/reorder。沿用认证、输入校验与安全错误响应，不开放 Shell→Open API 的新 Config 合约。

配置资产页支持 TEXT 创建/新 revision、Secret Keep/Replace、revision metadata 与 usage；Repository 增加 Config tab；Task 编辑器增加 Config/Hooks、继承/override/MASK/effective preview 和按阶段排序。Settings 保持平台内部职责。

## Breaking Changes / Legacy Bridge Removal

- DB v1 → v2 为明确平台升级；不兼容未知库或 QingLong 数据。
- 删除 Task `task_before/task_after`、Subscription 旧 before/after 字段/API/UI，protobuf 标签 reserved，Python SDK 类型同步。
- 删除旧公开 ConfigService/API、任意路径 Config editor 与跨 domain 写入方式。
- 删除旧 `/tmp/env_PID.json` 回传、preload hook 解析/ENV mutation、旧 shell hook 启动入口与无用模板。
- 删除重复 TaskEnvironment CLI/redactor；保留现行 ExecutionEnvironmentTransport，完整执行统一接 TaskExecutionPreparation。
- B06 Hook-specific 部分已移除，SDK/依赖解析/账号选择/信号保留；B11 sharply reduced 为内部 Settings/config.sh。

不删除既有用户文件或真实 DATA_DIR 内容。B05 Global generated ENV 继续保持 REMOVED。

## Remaining Temporary Bridges / Concurrency

B01 scripts staging、B02 task.sh/otask.sh、B03 system crontab projection、B04 scheduler adapters、B06 非 Hook preload、B07 discovery adapter、B08 状态回环、B09/B10 依赖布局、B11 内部 Settings、B12 运维 CLI、B13 SDK、B14 日志 identity、B15 Task bridge 表、B16 当前 backup 职责继续保留。

新增 B17 TaskWorkspaceResolver/ConfigMaterializationLease，在 Phase 9/10 的 ExecutionContext、直接 Worktree 执行及全部隔离/恢复 gates 完成后退出。Config Domain 不依赖未来 Runtime 实现。

## Known Limitations

1. TEXT only，未提供 Binary、revision GC、Secret at-rest encryption、Backup v2。
2. 当前 backup 不能视为已证明覆盖新 Config canonical/journal/运行态的一致性备份；后续需正式设计。
3. 当前脚本执行目录仍共享；有配置运行时同 workspace 保守互斥。全局 publication SH 可阻塞其他订阅发布，Script API 在任意配置运行期间保守返回 BUSY；独立 workspace 执行仍可并发。
4. 异常恢复遇到用户新增/篡改文件 fail-closed，保留 journal/backup，需人工处理冲突；不自动删除未知文件或已创建的空目录。
5. 无恶意同 UID 代码沙箱/DLP；SIGKILL 不保证用户 FINALLY；原始 tsc 仍有 53 项既有错误；Linux 实机结果待 CI。

## Important Findings / Review

- macOS `fs.link` 对 symlink 的行为需要显式 no-follow 安装，已有定向和真实执行验证。
- FK CASCADE 使“先删 Task 再恢复定义”的旧订阅补偿不再安全，已调整为最终删除并加入子资源完整性测试。
- 既有 publication 使用全局 ID 1；按 subscription ID 加读锁不能保护真实发布器，已统一 key 并加入真实锁阻断测试。
- 仅屏蔽 Secret Asset API 不够，COPY 注入副本还需防止现有 Script API 旁路读取；新增锁及 stale-journal guard。
- GitNexus 使用 CLI（MCP 未提供），完成编辑前 impact 和 HEAD/develop detect-changes；UNKNOWN 不被视为无消费者。检测为 critical，符合涉及 schema、Runner、发布与文件 API 的跨流程范围。审计产物位于 `diagnostics/phase5/`，临时 index 不修改用户暂存区。

### Git helper 偶发异常根因与修复

全量测试曾在不同 Git 操作出现 WORKSPACE_HELPER_FAILED，普通 Git/输出压力调用未复现。加入短超时压力后，8 个 worker 均复现相同错误：子进程已结束、finally 再次 killpg 时产生 PermissionError(errno=1)。Apple XNU 的组遍历会过滤 zombie，并在无可发信号成员时返回 EPERM，与实测一致。依据：[Apple kern_sig.c killpg1](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_sig.c)。

新增小型 `shell/process_group.py`，供既有 Git helper 与 Phase 5 Hook/lease supervisor 使用：正常发送信号；ESRCH 视为组已消失；仅 Darwin EPERM 才用固定 `/bin/ps` 查询 PGID/state，确认目标组无存活进程才允许清理完成。活进程、无法解析、检查超时或真实权限失败均 fail-closed。查询不读取 command/ENV，不输出私密诊断，不盲目忽略 PermissionError。

确定性回归构造真实未回收 zombie group，并注入 Linux/Darwin、活进程、检查失败等边界；已有超时/控制进程崩溃/子进程租约测试继续执行。修复后按相同脚本进行 800 次真实 Git 短超时压力验证，并再次执行正式全量门禁。临时 traceback 诊断已移除，WorkspaceLocks TypeScript 保持基线实现。

证据：`git-helper-timeout-stress.log`（修复前）、`process-group-stress.py/log`（复现脚本与修复后结果）、`process-group-tests.log`、`platform-tests.log`。早期无复现与失败日志保留为调查过程，不替代最终结果。

## Phase 6 Preconditions

下一阶段建议 **Phase 6 — Python Runtime Manager**。开始前读取本报告与 B06/B09/B10/B17 职责，保留 Config snapshot/Hook lifecycle/租约/恢复/脱敏合约；取得 Ubuntu CI 结果并处理任何差异。Runtime 设计需显式可执行文件与依赖环境 identity，不恢复全局 ENV 生成或旧 Hook 回传。Phase 5 在此停止，未实现 pyenv、venv、Node Runtime、TaskRun domain 或 Runner v2。

详细设计与测试索引：[docs/refactor/phase5](docs/refactor/phase5/01-config-asset-domain.md)；架构图：[Config Assets and Hooks](docs/architecture/09-config-assets-and-hooks.md)；桥登记：[TEMPORARY_BRIDGES.md](TEMPORARY_BRIDGES.md)。
