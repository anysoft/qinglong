> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](docs/architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Phase 4 — Scoped ENV 交付报告

## Phase 4 Status: PASS

基线：`develop / 998a4d66`。本次完成本地实现与验证，未提交、部署或操作线上数据库。前序 Phase 0–3 报告与架构文档已读，沿用现有 Repository、Subscription、Task 与执行入口。

| 项目 | 结果 |
| --- | --- |
| Global ENV Compatibility | PASS |
| Repository ENV Profiles | PASS |
| Task ENV | PASS |
| Scope Resolution | PASS |
| UNSET | PASS |
| Execution Isolation | PASS |
| Secret Handling | PASS（明文落盘边界见下文） |
| Python / Node / Shell | PASS |
| Legacy Regression | PASS |
| API / UI | PASS |
| Build | PASS：前后端生产构建 |
| Browser Validation | PASS：Chrome |

**Tests: 298 passed / 0 failed / 3 skipped。**

**Production Behavior Changed: NO for existing behavior。** 未配置 Scoped ENV 的任务保留原 Global 路径；新增配置才启用快照及覆盖。仓库删除新增 Profile 引用保护，是新资源的一致性约束。

## 实现结果

- 新增 EnvironmentProfiles、RepositoryEnvVariables、TaskEnvVariables。Repository default、Subscription override、Task override 使用可空引用；迁移在现有事务内增加表、索引和列，旧记录默认为 NULL，迁移 ledger 为 21 项。
- Profile 支持 CRUD、复制、默认选择、禁用、引用删除保护；复制 Secret 仅在服务内部进行。仓库删除在删除 Git 存储前检查 Profile，并阻止 DELETING 仓库新建 Profile。
- 统一 TaskEnvironmentResolver 按 Task → Subscription → Repository default 选择一个 Profile；仓库上下文仅来自 Task.sub_id → Subscription.repository_id。无仓库手动任务仍可使用 Task ENV。
- 合并顺序 Base → Global → Repository → Task。disabled 忽略、UNSET 删除、空字符串保留；返回冻结的值、来源、Secret 标记和版本元数据。Preview 不启动进程、不创建实例或快照。
- 执行入口通过任务 ID 从 SQLite 解析，生成每次执行独立的私有快照。目录 0700、文件 0600；正常退出清理，启动及后续准备时回收过期且所有者已退出的快照。不修改后端 process.env 或共享 Global 文件，不把 Secret 拼进 argv。
- Shell 和 Node/Python preload 在旧 Global 逻辑之后应用 Scoped overlay；复制原 Global 文件保留 Shell trim、重复值 `&`、disabled、JS 模板等历史语义。账号并发模式使用私有临时日志。
- 显式 Secret 的 API 只返回掩码、has_value 与元数据；支持 keep/replace/clear，禁止用掩码覆盖或隐式降级为 Plain。日志错误使用固定代码；输出脱敏涵盖原值、账号拆分、JSON 转义、URL/base64，并正确处理 UTF-8 分块。
- UI 包含 Global 兼容入口、Repository Profile 管理、仓库详情 Environment 标签、Subscription 选择、Task override/UNSET/Profile 与 Preview。绑定和变量编辑即时保存，独立于父表单提交。

## API

所有新增接口位于面板 `/api/scoped-env`；拒绝 `/open/` 及自定义前缀下的 open 入口，沿用面板认证。原 `/api/envs` 与 `/open/envs` contract 不变。

| 路径（省略前缀） | 操作 |
| --- | --- |
| /repositories、/tasks | GET 列表与统计 |
| /repositories/:id/profiles | GET Profiles |
| /profiles、/profiles/:id | POST/PUT；GET/DELETE |
| /profiles/:id/clone | POST 复制 |
| /profiles/:id/variables | GET/PUT 批量变量 |
| /tasks/:id/variables | GET/PUT Task 变量 |
| /tasks/:id/profile、/subscriptions/:id/profile | PUT 绑定或 NULL 继承 |
| /tasks/:id/context、/subscriptions/:id/context | GET 可选 Profile |
| /tasks/:id/preview | GET 脱敏解析预览 |

变量批量写入是事务操作；非法名称、跨仓库绑定、重复条目、Secret 替换与删除引用均有校验。列表使用聚合计数，避免逐行解析。

## 验证与证据

| 测试集 | passed | failed | skipped |
| --- | ---: | ---: | ---: |
| 原有 test/back + test/front | 176 | 0 | 3 |
| Phase 0 | 17 | 0 | 0 |
| Phase 1–3 | 83 | 0 | 0 |
| Phase 4 | 22 | 0 | 0 |
| 合计 | 298 | 0 | 3 |

三个跳过是原有 macOS flock 平台限制。新增测试包含旧行为先行 characterization、迁移幂等/回滚/索引、Profile 优先级、Secret CRUD、HTTP 错误与 open 拒绝、复杂值/注入样例、三语言及 conc 模式、50 次执行（每批同时 10 个）、无配置后续执行无残留、过期文件清理、实际 SQLite ID → task.sh 桥接。

Chrome 使用生产前端与实际 Scoped API/SQLite，操作 Profile 创建/默认/复制、Secret/Plain、订阅绑定及 Task 覆盖/UNSET/Preview，并通过测试调度桥执行真实 Python/Node/Shell task.sh；无页面异常。另有真实内部 CLI 入口测试，未启动生产 gRPC/crond 守护进程。

前后端生产构建成功；Bash 语法和 Python AST 检查成功。前端独立 `tsc --noEmit` 仍报 65 条现存类型错误，不能将它描述为绿色；新增 Scoped ENV 文件没有类型诊断。未改依赖或锁文件。

证据与复现命令：

- [验证汇总](diagnostics/phase4/verification.json)
- [旧路径完整性](diagnostics/phase4/legacy-integrity.json)
- [测试说明](docs/refactor/phase4/08-phase4-test-report.md)
- [浏览器脚本](diagnostics/phase4/ui-smoke.cjs) 与 [截图](diagnostics/phase4/scoped-env.png)
- [GitNexus 变更检查](diagnostics/phase4/detect-changes.txt)

## 架构与影响检查

编辑前对已有符号执行 upstream impact。Crontab（11 个直接影响、28 个总影响）和 Subscription（15/23）为 HIGH，已事先告知；修改限于可空 Profile 字段及兼容构造。迁移、执行 preload、传输和新 API 包装为 LOW。Shell/部分 React 入口无法被索引解析，按真实调用源码与执行测试补充检查，未将 UNKNOWN 当作无影响。

最终重新索引并对 develop 执行 detect-changes：83 个文件、223 个符号、57 条受影响流程，聚合风险 **CRITICAL**，已明确告知；该风险不能被测试通过抵消。使用临时 Git index 纳入新文件，未暂存到真实 index。预期范围为新 ENV 资源、加法模型/迁移、Task Shell/preload、UI 及测试。Global 服务/模型/API、原 Cron/Subscription 服务、Git 命令/凭据与 Worktree 服务未修改。Scoped 数据不会传入 Git fetch、发现、依赖安装、后端或通知服务。

## Known Limitations

1. **At-rest encryption remains a future security improvement.** SQLite/备份仍为明文；私有快照不是针对同 UID 或管理员的安全沙箱。用户脚本自行写文件、传网络或任意重新编码不在日志过滤保证内。
2. 保留历史 Global JS 模板求值等行为；Preview 展示 Global 原始值，不执行模板。实际语言加载行为由复制的原 Global 文件保持。
3. 保留执行器内部 ENV 名称，避免覆盖命令/目录/钩子 bookkeeping；单值最多 120 KiB、总环境最多 128 KiB，超限明确失败。
4. 崩溃清理检查至少一小时旧快照与 owner PID；PID 复用或无法确认所有者退出时保留。它不是立即清理保证。
5. 本机验证为 macOS + Node 22；宿主 Node 26 与历史依赖不兼容。尚未认证完整 Linux 容器和系统定时守护进程矩阵。前端历史 65 条独立类型错误仍待专项处理。

## Recommended Phase 5 Entry Point

**Config Assets + Hooks v2**。以 resolver 输出的不可变环境及现有 Task 执行上下文为边界，继续设计配置资产和钩子；本阶段没有引入 Runtime、Execution Resolver 或配置资产迁移。

## 专项设计文档

[模型](docs/refactor/phase4/01-scoped-env-model.md) · [Repository Profiles](docs/refactor/phase4/02-repository-env-profiles.md) · [Task overrides](docs/refactor/phase4/03-task-env-overrides.md) · [解析](docs/refactor/phase4/04-environment-resolution.md) · [传输](docs/refactor/phase4/05-execution-env-transport.md) · [Secret](docs/refactor/phase4/06-secret-handling.md) · [兼容](docs/refactor/phase4/07-legacy-env-compatibility.md) · [测试](docs/refactor/phase4/08-phase4-test-report.md)
