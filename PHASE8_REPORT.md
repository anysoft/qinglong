# Phase 8 Status: PARTIAL

Phase 7 已 checkpoint 为 `33564c77`，当前分支 `codex/phase8-node-environments`。开始前已完整读取 Phase 4.5B/5/6/7 报告、架构文档和 Temporary Bridges；Phase 7 无 CRITICAL architecture blocker / schema corruption / reference corruption，继承 Linux pending 和 53 项既有 TypeScript debt。

| Item | Status |
|---|---|
| Schema | PASS |
| Node Runtime Domain | PASS |
| Node Distribution Provider | PASS |
| Catalog | PASS |
| Runtime Install / Verify | PASS |
| Package Manager Toolchains | PASS |
| pnpm | PASS |
| npm | PASS |
| Node Environment | PASS |
| Environment Revisions | PASS |
| Environment Builds | PASS |
| Lockfile / Resolution | PASS |
| Shared Store | PASS |
| Lock / Recovery | PASS |
| API / UI | PASS |
| Browser Validation | PASS |
| Fresh E2E | PASS |
| Official Node Integration | PASS |
| Linux Validation | PARTIAL — workflow configured, not executed remotely |

核心功能与本地门禁全部通过。总体 PARTIAL 仅来自未执行的 Linux CI 与 53 项既有 TypeScript debt（新增 0）。Phase 8 改动保留在工作区，未提交、未推送；没有启动 Phase 9。

## Tests / Builds / Typecheck

- 完整平台测试：348 tests，345 passed / 0 failed / 3 原有 skipped。无新增 skip；证据 `diagnostics/phase8/platform-tests-final.log`。
- 真实 Node 本地 registry：`offline-final.log` / `offline-result.json`；取消/timeout/并行/SIGKILL/recovery：`lifecycle-final.log` / `lifecycle-result.json`。
- 真实 Python venv/pip：1 passed / 0 failed，`python-offline-regression.log` / `python-offline-result.json`。
- Backend Build / Frontend Build：PASS，`final-builds.log`。使用 Node 22 直接执行项目 build scripts，避免宿主 pnpm 自动版本切换。
- Typecheck：PARTIAL，53 existing / 0 new；raw tsc exit 2，regression gate PASS。`final-typecheck.json`。
- 静态审计：PASS，0 forbidden/unclassified；所有旧全局 Node / NODE_PATH 命中均有实际 consumer 与退出条件，`final-static-audit.json`。
- Browser/Fresh：PASS（`platform-e2e.json`），包含完整 Git/ENV/Config/Hooks/Python/Node 与重启流程，审计 1,942 个 HTTP 响应载荷、29 个 WebSocket 帧，无测试 Secret 泄漏。

## Database Changes

实际 v4 → v5；新增四表 NodePackageManagerToolchains、NodeEnvironments、NodeEnvironmentRevisions、NodeEnvironmentBuilds，复用三张 generic Runtime 表，共 30 models。Desired/Resolved 使用 JSON 快照而非重复拆表。复合 FK、RESTRICT、immutable trigger、同名依赖校验与 optimistic version 均生效。

运行中最新数据库签名另见 `diagnostics/phase8/current-schema.json`。

旧 v4 冻结：
- model `f87ccaa6e53e9a975ca25c8215dddd418900ac8c24370799f33cd3860efc973d`
- schema `bed6850a372e4e208f56326de92dd784cb78ef009689519215706cb850a96f09`

v5：
- model `632024721991a6f497272ff0d8e73f120705fa3f8ff279e0b0729e8a29ea4510`
- schema `70f7d5ad6dbc652be20b6611834b1a85f3613de4b02cfd7487c22b3eff80defe`

迁移使用 IMMEDIATE transaction。真实旧 Python Environment/Revision FK 保留，晚期 fault 全回滚；fresh == migrated signature，损坏 previous schema 拒绝。SQLite 父表 drop/recreate 留存 deferred counter 的处理是保持 foreign_keys=ON，最终 foreign_key_check 必须为空，再 defer_foreign_keys=OFF 清除旧计数并提交；不是关闭 FK 逃避验证。

## Runtime Core Changes

RuntimeOperationService 统一 Node/Python Operation 的 request、executor、日志、取消、timeout、terminal transaction 和 recovery。NodeEnvironmentService 仅负责领域 prepare/execute/commit。Python 与 Node 的 provider 锁分离，Node Environment 可并行上限 2；所有资源 FD 继承给原有 process supervisor，补强 Python Environment 的 FD 生存期。

RuntimeReferenceService 总是聚合 Python 和 Node 来源。语言/provider/implementation 身份受 DB 约束；没有新 NodeInstallJobs/第二套 Operation。原有 Task/Hook/Subscription/Discovery/Config/Dependency runner 实现未修改。

## Node Distribution Provider / Catalog / Lifecycle

Official metadata → exact version/platform/arch → private download → SHA256 → safe archive preflight/manual extraction → absolute Node diagnostic → atomic publish。Catalog 包含 LTS/date/files，用户选择必须解析 exact，不自动升级既有 Runtime。

Runtime Verify 包含 process.execPath/version/versions/platform/arch、executable hash、bundled npm identity；Repair 重新下载 exact artifact staging，引用存在时拒绝；Remove 要求锁/refs/ownership。未知资源只诊断，不擅自删除。

实网主版本 **24.21.0**，darwin-arm64，npm **11.19.0**，pnpm **10.17.1**。
- Artifact SHA256 `6239d4cf92d864487ec8cd3615038f7b67e7f58b77b21cd2f09ea9fbd68065fe`
- Executable SHA256 `e4b5a3af0e05c75de2eae013904145f40fe7fc2a6e6f17510128bf45cca4e79b`
- 相邻 LTS **22.23.2** 安装/Verify/Remove PASS，artifact SHA256 `5eff7a9011895aae3f29d06f167b84a62b028a591370c7cafb59103559fd26e1`。

结论仅为 **SHA256 verified against trusted upstream metadata**；`signature_verified=false`。实网 provision 使用 production provider，浏览器为节约重复下载复制该已验证 binary，再使用 production verify；两种证据清楚分开。

## Package Manager Toolchains / pnpm Model / npm Model

Toolchain 是 exact、不可变 identity 的一等资源。PNPM 用 absolute managed Node + bundled npm 安装到私有 toolchain root，先验证 engines，记录 real CLI/hash/--version；NPM 仅使用 bundled exact 版本，不升级 Runtime。所有执行不依赖 shebang/system Node/nvm/Corepack activation。生产路径的删除 → 同版本重装 → Verify 亦已通过，见 `toolchain-reinstall-result.json`。

首版 pnpm adapter 支持 10.9+ 的 10.x，实测 10.17.1；该下限保证显式 ALLOW policy 可由 dangerouslyAllowAllBuilds 表达。NPM 11.19.0 的实际 install/ci 已验证。Yarn、其他 pnpm major、独立 npm 升级延后。

## Node Environment / Revision / Build Model

Environment 的 Desired Revision 与 Current Build 分离。name/description 可 optimistic edit 不构建；依赖变更创建新 Revision，再新 Build。失败保留旧 Current。Clone 复制定义/策略并重新 Build，不复制 node_modules。

Build 独立 ID/root/node_modules。READY publication 同事务保存 immutable package/lock/resolved snapshots 与 Current；Build history/diff/verify/promote/export/delete 均提供。Build 目录不在完成后 rename，以保留 native/package absolute path；未 READY 目录不被 Resolver 消费。

## Dependency Specification / Lockfile Strategy / Frozen Rebuild / Re-resolution

仅结构化 registry package name + semver range、DEPENDENCY/DEV_DEPENDENCY。拒绝任意 flags、命令、路径、file/workspace/Git/URL、重复包、控制字符和注入。tags 首版延后。

生成 private package.json，记录 production_only 与 ALLOW/IGNORE。pnpm-lock.yaml/package-lock.json 捕获内容/hash；resolved graph 区分 direct/transitive。Frozen Rebuild 固定旧 Revision、Runtime、Toolchain、lock（pnpm frozen / npm ci）；显式 Re-resolve 才重新求解兼容版本。真实本地 registry 测试新增 transitive 版本验证两者差异。

## Shared pnpm Store / Cache / Filesystem

Runtime、Toolchain、Environment、Build 均 ID 路径+外部 ownership sidecar（kind/id/parent/dev/inode）。Node cache 与 Python 分域。pnpm store 按 Toolchain 共享，但 Build node_modules 独立；copy import + sideEffectsCache=false，防脚本经 hardlink 改写旧 Build。npm 使用共享下载 cache、私有配置。

Environment 删除不清空 cache/store；cache GC 延后。Runtime/Environment/Build orphan 诊断只读且有扫描上限。未知目录/替换 inode 不接管或删除。定义、Desired、锁/解析/manager metadata 属唯一资料；node_modules/store/cache 可重建。Runtime binary 备份策略留 Phase 14。

## Environment Resolver / Locks / Crash Recovery

Resolver 返回精确 Runtime/Toolchain/Build、绝对 Node、lock identity 与 Build pin；只接受 READY+HEALTHY，并检查 ownership、manifest/config/lock/CLI/runtime hash。Phase 8 API preview 用后释放，未来消费者需保持 pin 至执行完成。

锁顺序 Runtime SH → Toolchain SH → Environment EX → Build pin，修改资源需 EX；同 Env BUSY、不同 Env 两个跨进程 slots、Python/Node provider 可并行。cancel/timeout TERM→KILL 全进程组，crash recovery 只有取得 operation EX 后终结旧任务，不抢仍活跃子进程锁。失败不切 Current。Delete 先 DELETING+FS，再 DB finalize，未知文件保留并可显式重试。

## Install Script Security

ALLOW/IGNORE 对 npm/pnpm 都实际执行验证，production_only 实际过滤 dev 包。子进程仅显式 ENV allowlist + private HOME/TMP/config，Task ENV/Secrets/Config/Git Credentials/proxy/NODE_OPTIONS 不继承。

**安装脚本/native build 可执行第三方代码，不是 OS sandbox。** 服务用户权限不被隔离；不能宣称可阻止同 UID 的任意访问。verify 不逐文件 hash 全部 node_modules，不能检测任意篡改。直接依赖协议规则不等于第三方传递依赖或 registry metadata 的安全沙箱。

## API / UI

/runtime/node 管理 Catalog、Installations、Toolchains、Environments；通用 /runtime/operations 提供同一日志/取消。严格 Joi unknown=false，无用户内部路径/registry/raw command 参数，panel-only，Open API 拒绝。

Runtime 页面 Python/Node 分栏，Node Versions/Environments，LTS 过滤、exact manager、Desired/Resolved、History、Diff/Promote、Verify/Export。操作弹窗沿用原有基础设施，提高层级避免详情遮挡；Build Diff 下拉框层级独立于 sticky table，浏览器步骤等待上一个下拉框关闭动画完成。

## Legacy Node Dependency Bridge / Temporary Bridges

**RETAINED UNTIL PHASE 9/10**。实际 consumers：back/config/util.ts、DependenceService 的全局依赖；shell/start.sh/check.sh 的平台 bootstrap/repair；shell/share.sh 的 NODE_PATH/npm_install_sub；language preload/ESM loader 的当前模块搜索；Docker 平台 Node/pm2/ts-node。新模块没有依赖上述 bridge。

不能为了移除 B09/B10 自动把旧 Task 指向 Environment。Python bridge 与 Linux packages 责任仍保留。B05 已移除；B01–B04、B06–B17 继续按 TEMPORARY_BRIDGES 的实际退出条件管理。

## Platform Regression

完整既有 Git/Workspace/ENV/Config Assets/materialization/recovery/Hooks/secret redaction/Scheduler/Runner 测试保留，Python managed CPython 3.13.15 实际源码安装及 venv/pip 离线回归通过。浏览器从空 DATA 构造 Git→Subscription→ENV→Config→Hooks→三语言 Task→Python→Node→restart，验证共存与 FK，Task 无绑定。

## Important Findings

1. SQLite deferred FK counter 必须与最终真实 foreign_key_check 区分；保持约束验证后清除过期计数，真实旧引用迁移通过。
2. npm 11 不允许 user/global config 同指 /dev/null；使用两个独立 private config 路径，避免初始化失败。
3. pnpm 10 默认脚本策略与用户 ALLOW 不同，显式配置且限制支持版本。
4. 长操作必须把所有 resource FD 传给 supervisor，后端退出不代表子进程完成。
5. 真实 UI 验收发现 Operation 弹窗被详情遮挡；另外修正测试连续操作下拉框时误取关闭动画中旧选项的问题。服务测试无法替代浏览器交互验收。
6. 官方下载测试与 browser prebuilt copy fixture 分开；不将 fixture 计作网络 PASS。
7. 浏览器日志中的 409 RUNTIME_REFERENCED 是预期拒绝删除被引用 Runtime 的负向测试，不是验收失败。

## Known Limitations / Linux Gate

- Linux workflow 已配置 Ubuntu official Node install/checksum、exact toolchains、real local registry、cancel/locks/restart/fresh browser；未推送或触发远端 CI，Linux 为 PARTIAL。
- TypeScript 53 既有错误未增加，原始 typecheck 尚非零退出。
- Linux glibc 官方构建需要主机支持；macOS arm64 实测，其他架构只有选择/拒绝与 fixture coverage。
- 不做官方 PGP signature verification、全 node_modules 内容 hash、OS sandbox。
- Yarn、tags、private authenticated registry、cache GC、跨主机 native binary portability 延后。
- GitNexus process discovery 有入口/分支预算截断；空调用边不证明无影响。detect_changes 的完整列表通过临时 output cap helper 导出，不修改安装工具或分析算法。最终结构化审计快照相对 HEAD 537 个符号/52 流程、相对 develop 1,277 个符号/88 流程，均为 CRITICAL；后者包含 Phase 6–8 累计变更，最终完整结构见 graph-review-HEAD/develop.json。

## Phase 9 Preconditions

确认 Linux CI 结果、保持 immutable Resolver pin contract、定义 Task resource binding 与执行生命周期，之后才能替换 current Runner consumers。**本次停在 Phase 8；没有实现 Phase 9 Task Binding、ExecutionContext v2、Runner v2 或自动 Repository package discovery。**

详细设计：[11 份 Phase 8 文档](docs/refactor/phase8/01-node-runtime-domain.md)；[Runtime 架构与三张图](docs/architecture/12-node-runtime-environments.md)。

## Owned Fixture Cleanup

`cleanup-result.json`：PASS。两个 provisioner 创建的私有 tmp fixture 已通过 production Verify/Remove 流程移除 Runtime、清理 Toolchain，并确认没有 Environment refs 后删除 fixture root。全部 Operation logs 归档到 `managed-node/final-operation-logs/` 与 `managed-runtime/final-operation-logs/`；provision manifest 标记 `fixture_removed=true`，保留来源/hash，不伪称目录仍存在。重新运行真实测试须先重新 provision。没有删除项目或用户数据。
