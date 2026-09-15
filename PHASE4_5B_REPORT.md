# Phase 4.5B Status: PASS

**Step 2–7 已完成，核心 Gate 全部通过。Fresh v1 Schema Frozen for next development phase。** Linux 实机验证按本任务允许的例外标为 PARTIAL；全局类型检查保留 54 条既有错误，新增 0。不将这两项表述为完全通过。未开始 Phase 5。

| Item | Status |
|---|---|
| Fresh Schema v1 | PASS — 最终字段直接建库，版本 1，签名/FK/回滚/未知库拒绝 |
| Repository-only Subscription | PASS |
| Discovery Consolidation | PASS — 独立 Backend adapter、DB projection、稳定 identity |
| Legacy Git Removal | PASS — repo/raw/bot acquisition 与 SSH alias 路径删除 |
| ENV Consolidation | PASS — 唯一 Global、完整执行快照、四语言、50 并发 |
| API Consolidation | PASS |
| UI Consolidation | PASS — 单一 Environment、Repository-only Subscription |
| Filesystem Cleanup | PASS — Fresh 不创建 repo/raw，未删除用户目录 |
| Platform Test Baseline | PASS — 显式分类与逐文件归档替代映射 |
| Fresh Install | PASS |
| Full Platform E2E | PASS — 实际 HTTP/gRPC/Git/执行/日志/重启 |
| Browser Validation | PASS — 实际 Chrome 表单和交互，无 HTTP mock |
| Linux Validation | PARTIAL — 无可用本地 Linux 虚拟化；Ubuntu CI/harness 已配置 |

## Tests / Build / Typecheck

- **267 passed / 0 failed / 3 skipped**（270 tests）。三个跳过为 macOS 缺少 Linux flock 的既有锁用例；Linux workflow 安装 util-linux。证据：[最终测试日志](diagnostics/phase4.5b/final-platform-tests.log)。
- Backend Build：**PASS**；采用 clean compiler output，避免已删除 TS 对应的旧 JS 被打包。
- Frontend Build：**PASS**；production bundle 生成完成，有既有 bundle-size 提示。证据：[构建日志](diagnostics/phase4.5b/final-build.log)。
- Typecheck：**PARTIAL — remaining=54 / new=0 / original=65**。已清理修改模块中可有限修复的问题。原始 `tsc` 仍退出 2，不删除类型检查；CI 用原始诊断多重集阻止新增/增加错误。证据：[类型结果](diagnostics/phase4.5b/final-typecheck.json)、[原始预算](diagnostics/phase4.5b/typecheck-baseline.json)。
- Static Audit：**PASS**，276 个生产文件，禁止/未解释命中 0，47 个宽泛匹配均有 reason、consumer、bridge ID、removal phase。证据：[完整审计](diagnostics/phase4.5b/final-static-audit.json)。
- `git diff --check` 与修改 Shell 的 `bash -n`：PASS。

## Fresh Install / Browser / Linux

[实际 E2E](diagnostics/phase4.5b/platform-e2e.cjs) 在独立私有空目录启动最终 Backend 与 gRPC，提供仅允许读取 fixture 仓库的真实 SSH Git 服务，使用真实浏览器完成：

1. Fresh initialize、管理员初始化、登录。
2. SSH Credential / known_hosts 创建、Repository 创建与 initialize/fetch。
3. Subscription 创建、branch 设置、Prepare、Sync、Discovery、Worktree 查看。
4. Global、Repository Profile/default、Task Override、Effective Preview。
5. Python / Node / Shell 实际执行与日志查看。
6. Subscription 禁用/启用、Backend 重启、重新登录、再次执行。
7. 再次执行要求日志相对先前发生变化，不能以旧日志充当成功；最终检查版本 1、FK 与无 repo/raw。

主流程通过 UI 操作；内部 API 仅用于结果轮询/断言及重启后的重复运行。订阅表单额外断言不含旧模式、Manual URL、Convert、Pull 或 Credential Override。结果：[E2E JSON](diagnostics/phase4.5b/platform-e2e.json)、[浏览器截图](diagnostics/phase4.5b/browser-subscription.png)。安全、2FA、故障补偿与四语言边界另由 release tests 验证，不声称截图覆盖全部安全行为。

Linux：已再次探测 Docker、Podman、Colima、Lima，均不可用；未取得可执行的现有 Linux runner，也未发布或触发外部 CI。因此 **PARTIAL — environment unavailable**，没有 Linux 实机结果。

[Validate workflow](.github/workflows/validate.yml) 提供 Ubuntu / Node 22 / pnpm 8.3.1 frozen install、Git/OpenSSH/Python/Perl/jq/util-linux、Backend/Frontend build、release tests、类型新增预算、隔离 Playwright/ssh2 与 Chromium、同一 Fresh browser harness、产物归档。YAML 与本地 harness 已验证；Linux 执行结果需 CI 实际运行后补充。复现命令见 [测试基线](docs/refactor/phase4.5b/07-platform-test-baseline.md)。

## Previous Checkpoint

上一轮 Step 0 PASS，Step 1 为建库机制检查点，Subscriptions/Envs 字段与 Step 2–7 尚未收敛。本次沿用并回归该机制，按顺序完成后续步骤，未重新设计 bootstrap。`step0-*`、`step1-*` 及各步过渡日志保留为历史证据；最终结果以 `final-*`、`platform-e2e.json` 和本文为准。

## Breaking Changes

- 仅 Fresh 安装。未知/旧库和本阶段中间检查点库签名不匹配即拒绝启动，不迁移、不清空、不自动 reset。
- 不支持 URL-only、Legacy/Managed 双模式、raw/file Subscription、credential override、convert、pull/proxy/alias/command 字段。
- 只支持 branch，不伪造 tag/commit Ref Model。
- Global key 唯一，取消重复值 `&` 聚合、position 改语义、模板求值及 trim 差异。统一 SET/UNSET/Secret/enable contract。
- 删除旧 panel ENV API/import、Crontab import、旧 filename 410 路由、重复 Repository DELETE 与全局 SSH alias 配置入口。
- 删除 ql repo/raw/bot；保留仍被使用的 ql 运维能力。不支持 auth.json、明文密码与旧 token 形状迁移。

## Final Fresh Schema

`platform_schema_version=1` 对应 **最终 Operational Schema**，在单个 SQLite IMMEDIATE 事务直接创建 15 个当前 ORM 模型及 PlatformMetadata。

- Subscriptions.repository_id NOT NULL + FK；worktree_id 在 CREATED/PREPARING 可空，Prepare 后稳定绑定；旧字段已从 Model/DB/DTO/API/UI 删除。
- Envs.name UNIQUE、value TEXT、operation SET/UNSET、is_secret；内部数字 status 与 metadata 供现 SDK bridge 使用，不构成第二个 Global 产品模型。
- Crontabs 新增 source_relative_path、discovery_key、discovery_definition，unique(sub_id, discovery_key)；保留必要执行/调度/统计桥模型。
- 版本记录、模型签名、实际 SQLite schema 签名和 FK check 全部匹配才接受重启。建库失败回滚，重启不执行补列。

**Fresh v1 Schema Frozen for next development phase。** 没有 checkpoint v1 → final v1 migration。后续 Phase 若变更模型，必须采用新平台自身 v1 → future schema evolution。

## Removed Legacy Components

已删除旧 Subscription resolver/fallback/URL command、旧迁移运行代码、`update_repo`、`update_raw`、`git_clone_scripts`、重复 Shell scanner、`managed_discovery.sh`、Bot 入口/启动/配置、SSH alias service/startup、repo/raw 创建与旧路径初始化。

已删除 Global language generator、generated env.py/env.js/Global shell 文件消费与复制、旧 export-line parser、旧 UI 表单和 API 路由。迁移源与纯旧语义测试移至 `tests/archived/legacy/`，不进入 Backend 编译或 release gate。

保留 `shell/env.sh` 运维工具和 `/api/env.js` 前端非 Secret 配置；它们不是 Global generator。

## Repository / Subscription Model

Repository 独占 Credential 选择；显式 Anonymous 合法，引用缺失/禁用 Credential 明确失败，不静默降级。

Subscription → Repository → persistent Git storage → Worktree。资源改名、URL 拼写不改变发布所有权；namespace 为 `subscription-ID`。Prepare/initialize/fetch/ensure/FF-only、dirty/untracked/ahead/diverged/local-history、remote deletion、共享仓库/分支、锁/lease/timeout/恢复均保留回归。

内部 `ManagedSubscriptionService` 名字和日志标签仍表示唯一正常流水线，没有对应模式选择或 fallback。Worktree 的 managed 属性是路径所有权标记，不是 Subscription 双模式。

## Discovery Architecture

```text
locked Worktree + policy + DB Task projection
  → SubscriptionDiscoveryAdapter
  → private stage + definition changes + diagnostics
  → CronService.publishSubscription
  → live scripts + DB + scheduler projection
```

Adapter 不 Git acquisition、不 DB ownership、不 HTTP publication、不读取 live crontab.list。保留 nested/extensions/include/exclude/support、显式 cron/name 注释和 autoAdd/autoDel；无 cron 返回 NO_CRON_METADATA，不随机建任务。

稳定身份为 subscription_id + relative_path 的 discovery_key；name/schedule/command 不作主键。保存上一 source definition，增量更新时保留用户覆盖、ENV/hooks/禁用/运行状态。只处理当前订阅所拥有的定义和文件。

发布使用私有 stage、上一版 live、DB/scheduler 补偿；失败保留成功水位，补偿失败保留 recovery material，允许重试。scripts staging 与 Crontab publication 是明确桥，未提前实现 Phase 11 v2 DSL/reconcile engine。

## ENV Architecture

```text
Base Runtime ENV → Global → Repository Profile → Task Override
  → immutable Full Execution Snapshot → Current Runner bridge
```

Base allowlist 为 PATH/HOME/LANG/LC_*/TMPDIR/TZ/TERM/QL_DIR/QL_DATA_DIR/BACK_PORT/GRPC_PORT；不将 process.env 全量传给任务。显式端口支持实际 SDK/status 通道，Backend JWT/token/Git secrets 不继承。

所有入口均创建独立快照，包括 Global-only、no-ID/editor、手工与调度、Node/Python/Shell/TS。运行期间冻结，下一次读取新配置；临时目录 0700、文件 0600、owner 确认与 stale cleanup，argv 只带路径。Global generator B05 已实际退出，没有 BLOCKED_BY_PHASE10。

四语言验证空白、前后空格、Unicode/中文/emoji、美元符、命令替换文本、引号、反引号、&、=、JSON、多行、空值及 UNSET；不发生插值或命令执行。preload 保留 hooks/SDK/账号/依赖/信号。

## API Changes / UI Changes

Environment 只有 Global / Repository Profiles / Task Overrides，一个变量编辑器与 Secret keep/replace/clear。旧 `/envs` panel API 不再挂载，SDK 使用同一 Global store 并脱敏。

Subscription 表单保留 Name/Repository/Branch/Schedule/Discovery/Profile/Enabled 与现有 hook bridge。Repository/Worktree 的 Credential、Initialize、Fetch、Refs、Status、Repair、Lease 继续存在。

`/open` 的 status/stat/token/notify 是 **INTERNAL EXECUTION BRIDGE**（B08/B12/B13）；没有整删结果通道。Repository 删除只走带存储/引用/lease 保护的路径。未新增 Phase 5+ 空页面。

## Filesystem

Fresh 保留 db/git/worktrees/.locks/tmp，以及仍有消费者的 scripts/config/deps/dep_cache/log/syslog/bak/upload。执行临时 snapshot 独立 owner 管理。未为了命名统一改动 log/bak/upload，也未清理任何既有用户 Git/Worktree/配置目录。Git storage 可能含唯一历史，不是无条件可删除缓存。

Backend clean build 只清理 static/build，防止删除的 migration/API/service 编译残留进入新安装包。

## Security / Concurrency

Auth 初始化、哈希密码、JWT签名/过期/nbf、2FA 防重放/限流、会话撤销、文件边界、SSH strict known_hosts、凭据上下文、Git 锁/lease、dirty/local-history 保持安全约束。

ENV REST/preview/error/diagnostic 不返回 Secret 明文；实际任务输出通过流式脱敏到日志/WS。测试覆盖 Secret 不进入 argv、snapshot 权限/owner/预算/清理、分块 UTF-8 与跨块匹配。当前 SQLite Secret 仍明文静态存储，不宣称 at-rest encryption。

**50 个同时存活的执行**使用不同 Repository/Profile/Task、同名变量，经 barrier 确认并发后变更配置：已有运行保持 A，下一次获得 B，0 跨任务泄漏；父进程环境不变。另保留跨/同 Repository、Profile 选择失败与发布/调度并发安全用例。

## Platform Test Baseline

Manifest 分类为 **35 PLATFORM_CORE / 38 TEMPORARY_BRIDGE / 26 ARCHIVED_LEGACY 测试文件**。所有归档文件逐项记录删除能力或替代覆盖：[测试基线报告](docs/refactor/phase4.5b/07-platform-test-baseline.md)、[机器映射](diagnostics/phase4.5b/test-archive-map.json)。

没有归档仍需保留的 2FA/Git/锁/恢复安全职责。混合旧测试抽取核心用例到 platform suite；旧 migration/convert/URL-only/聚合/410 语义不再作为发布契约。

## Remaining Temporary Bridges

- **B05 REMOVED**：Global generated ENV。
- **B07 REDUCED**：独立 Backend Discovery Adapter，后续 Phase 11 替代有限 parser。
- **B03 REDUCED**：仅 system scheduler projection，已无 Discovery/no-ID 反读。
- 保留 **B01/B02/B04/B06/B08–B16**：scripts、Runner、scheduler、非 ENV preload、内部结果通道、dependencies/deps、hooks/config、运维、SDK/notify、logs、Crontab 模型、backup。

每项 consumer、原因、替代方案与退出 Gate 见 [TEMPORARY_BRIDGES.md](TEMPORARY_BRIDGES.md)。这些是尚未替代的运行职责，不是旧平台兼容承诺。

## Known Limitations

1. Linux 实机 Gate 尚未运行，需在已提供 CI 执行并检查 3 项 flock 用例及 Fresh E2E。
2. 全局 typecheck 仍 54 条既有错误，主要为 Umi 生成导出和未重构页面类型；新增预算严格为 0。
3. branch-only；Task/Schedule/TaskRun、Config Assets、Runtime、Runner v2、完整 Discovery v2 未实现。
4. 当前备份桥不等于完整 Git/worktree 唯一数据备份契约；Secret 未加密静态存储。
5. DB、文件系统和 scheduler 无分布式事务；依靠补偿与可恢复材料处理失败，不能取消锁/lease 或无条件擦除工作区。

## Important Findings / Impact Review

真实 E2E 发现并修复了 Subscription modal 保存回调错误、空 cron 被注册、独立 Git helper 未装载既有 mTLS 凭据、完整 ENV 缺少 SDK/status 端口，以及 SQLite JSON raw projection 导致定义更新失效。新增 clean build 防止被删模块的编译残留。

各步骤执行 impact → implementation → targeted/regression → static review；HIGH/CRITICAL 影响已提示。最终 GitNexus 比较 develop 覆盖建库、认证、Git/订阅、ENV、Task publication/scheduler 与 UI；总体风险仍为 CRITICAL（变更跨度），不能把测试通过解释为调用图风险降为 LOW。Shell/动态 DI/未索引符号使用调用文本与实际测试补充，UNKNOWN 不作为安全证明。

[最终调用图审查](diagnostics/phase4.5b/final-review.txt) 使用临时 Git index 纳入新文件，不改真实 staging。变更保留在工作区，未创建提交或触发发布。

## Phase 5 Preconditions

本阶段代码与 Fresh v1 基线已就绪；进入下一阶段前保留本次 release gate、schema 签名与桥消费者约束。Linux CI 与既有类型债继续作为显式验收项，后续 schema 变化必须设计平台自身演进。

Recommended Next Phase：**Phase 5 — Config Assets + Hooks v2**。本任务在 Phase 4.5B 完成后停止，未执行 Phase 5。
