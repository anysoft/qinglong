# Phase 7 Status: PARTIAL

Phase 7 — Python venv + Dependency Environment 已实现。核心资源是 **PythonEnvironment → immutable Desired Revision → immutable venv Build**，包变更始终创建新 generation。Linux 实机 gate 与既有类型债务保持显式 PARTIAL。

| Item | Status |
|---|---|
| Schema v4 / fresh == migrated | PASS |
| Python Environment Domain | PASS |
| Environment Revision | PASS |
| Environment Build | PASS |
| Strict venv | PASS |
| Dependency Specification | PASS |
| pip Manager / shared download cache | PASS |
| Resolved Packages | PASS |
| Build / Rebuild / Promote / Diff | PASS |
| Verification | PASS |
| Lock / Recovery | PASS |
| Runtime References | PASS |
| API / UI | PASS |
| Browser Validation | PASS |
| Fresh E2E | PASS |
| Linux Validation | PARTIAL |

## Phase 6 Preconditions / Checkpoint

已确认 Phase 6 核心 Runtime gates 全部 PASS，无未完成 CRITICAL blocker。按请求先 checkpoint：`1eafedc7`，`feat: phase 6 managed Python runtime`。Phase 7 位于 `codex/phase7-python-environments`；本阶段工作区变更未提交、未推送、未部署。GitNexus 生成的未跟踪 CLAUDE.md 保留，未纳入 checkpoint。

## Tests / Builds / Typecheck

- 完整 release gate：**338 tests，335 passed / 0 failed / 3 skipped**；3 skips 为既有 macOS 条件，不新增或扩大 skip。
- 独立强制真实 offline gate：**1 passed / 0 failed**；结合上述 gates 为 336 passed / 0 failed / 3 skipped。
- Backend Build：PASS，exit 0；Frontend Build：PASS，exit 0。
- Typecheck：53 existing / **0 new**，raw tsc exit 2；regression budget gate PASS，债务状态 PARTIAL。
- Static Audit：325 production files、0 forbidden/unclassified；所有 Python package/search-path 引用均分类。
- Browser/Fresh：**37 steps PASS**，1,115 HTTP responses / 26 WebSocket frames，0 测试 Secret 泄漏。
- 真实 Runtime：官方 pinned pyenv 构建 CPython **3.13.15**；所有环境删除后再经生产服务 Verify/Remove 均 SUCCESS，剩余 0，测试 fixture 已清理。

证据：[release tests](diagnostics/phase7/platform-tests.log)、[offline result](diagnostics/phase7/offline-result.json)、[browser](diagnostics/phase7/platform-e2e.json)、[typecheck](diagnostics/phase7/final-typecheck.json)、[static audit](diagnostics/phase7/final-static-audit.json)、[Runtime final lifecycle](diagnostics/phase7/runtime-final-lifecycle.json)。

## Database Changes

Schema 3 → **4**，新增 PythonEnvironments、PythonEnvironmentRevisions、PythonEnvironmentBuilds；Desired/Resolved 为结构化 JSON，不混成一份 freeze。RuntimeOperations 只扩展环境操作类型，没有第二套 Job 表。

从 Phase 6 checkpoint 冻结实际 v3 fixture：model `c83d072e7f1bbff93669dfa1114ac6ad8b0cd4bd0b5a9c61256b6432ba263204`，schema `52f0f56ac70877e35d69af0c104e3ac38e4fd3a3cc3819976ad89e3c58cd55b1`。v1/v2 旧签名不变；valid v1→v2→v3→v4 在同一事务中逐级验证。fresh 使用相同最终 DDL，签名相同。篡改、未知库 fail closed，晚期 DDL 故障完整回滚并可重试。

## Python Environment Model

Environment 为独立平台资源，名称不参与磁盘身份。持有 exact runtime_id、可乐观更新的名称/描述/version、Desired current_revision_id 和发布的 current_build_id。状态 EMPTY/BUILDING/READY/ERROR/DELETING。

## Runtime Relation

只接受 READY、可验证的 managed CPYTHON Runtime，选择精确 ID，不随版本目录更新自动漂移。Runtime change 创建新的 Revision/Build。历史 Revision 与 Build 继续引用旧 Runtime；删除/Repair 返回 RUNTIME_REFERENCED、引用类型明细与总数。

## Environment Revision Model

Revision 存 `{normalized_name, requirement}` 与 spec_hash。支持标准 PEP 508 extras、version constraints、markers；按 PEP 503 去重，保留用户原表达式。SQLite trigger 拒绝 Revision 更新，API 使用 expected_version 防并发编辑。

Desired 可领先于 Current：保存新依赖后失败不会丢掉定义，也不会切换旧 Current。Metadata 编辑不生成 Build。Clone 复制选择和定义，再独立构建。

## Environment Build Model

Build 固定 environment/revision/runtime，拥有唯一稳定 venv 路径、resolved snapshot/hash、freeze、pip version、OS/arch、验证时间和磁盘用量。数据库保护 identity 和已发布 snapshot 不可变；READY 不退回安装阶段。

Current Build 与 Revision 的复合 FK 保证属于同一 Environment。旧 Builds 默认保留；删除只允许非 Current、无引用、无活动 shared pin。

## venv Architecture

绝对 Runtime Python `-I -B -m venv --symlinks` 创建隔离 venv，使用 Runtime bundled ensurepip。无 --system-site-packages、activation、shims、宿主 Python fallback。创建后先验证隔离，安装后再次完整验证。

venv 使用独有最终路径构建但暂不发布；不移动目录，因为 console scripts 含绝对 shebang。成功后只事务切 Current 指针。

## Dependency Specification

最多 100 条、每条 1000 字符。标准 parser 来自 Runtime bundled pip packaging；拒绝重复 normalized package、控制字符/换行、pip options、URL/VCS/file/local dependencies、userinfo/token URL、shell substitution。没有自动 Repository requirements.txt/pyproject 扫描，没有 Upgrade All。

## pip Package Manager

仅通过绝对 venv Python `-I -B -m pip`，每条 dependency 独立 argv，`--` 分隔 options。PIP_CONFIG_FILE=/dev/null，显式 no-input、disable-version-check、require-virtualenv、cache/index；不继承旧 pip mirror、Task/Config/Backend 搜索路径、Git credentials 或代理 Secret。

默认 PyPI，客户端不能配置任意 index/extra-index/path/pip_args。认证私有 registry 未实现。采用 pip 正常 PEP517 isolation、wheel/sdist 策略，不自动升级 pip/setuptools/wheel，不自动安装 OS 开发依赖。

## Resolved Package Model

使用真实 pip list JSON、freeze --all、pip check。记录 name/version/direct 与 index policy，保持 Desired/Transitive 分离。`source_index` 是解析策略，不是每个 artifact 独立溯源证明；bundled pip 也在 snapshot 内。Freeze 是可查看导出的观察结果，不宣称 artifact hashes 强制锁定的可复现 lockfile。

## Build Lifecycle

Provider EX → Environment EX → 创建 operation/build QUEUED → private HOME/TMP → disk check → venv → 隔离验证 → pip install → metadata/freeze/pip check → 验证 → log drain/fsync → 单事务 READY + Current + operation SUCCESS → 清理/释放。

失败、取消、超时、Backend crash 均不发布部分 venv。取消清理可确认 owned staging；未知内容不删除。发布 DB 故障回滚 Current；中断目录存在也不冒充 READY。

## Rebuild / Rollback

Rebuild 使用同 Desired 新建 Build，传递依赖可能变化，保存 resolved 方便比较。Promote 旧 READY Build 先验证再原子切指针，不重新安装。后续解析使用新 Current，已 pin snapshot 保持旧 ID/路径。

## Environment Resolver

返回冻结 `{environment_id, revision_id, build_id, runtime_id, runtime_version, python_executable, venv_root, resolved_dependency_hash}` 与真实共享 Build FD lease。检查归属/状态/ownership/config hash/interpreter 关系，并核对 Runtime executable SHA256。调用方必须释放；Phase 7 仅诊断和测试使用，没有 Task consumer。

## Filesystem

- `runtime/python/environments/env-ID/builds/build-ID/venv`：独立 generation。
- 环境根与 build 外置 sidecar：ID、runtime、owner、dev/ino，支持部分删除恢复。
- `.locks/python-environment-ID.lock` / `.locks/python-build-ID.lock`：稳定 inode。
- tmp/log 复用 Runtime namespace。

所有路径由服务端 ID 推导，逐级拒绝 symlink/异常 owner，venv Python 只能链接到指定 managed executable。ORPHAN/未知文件只报告，不接管、不自动清理。列表使用缓存+轻量路径/config 检查，完整 pip/磁盘扫描只在显式操作。

## Cache

`cache/python/pip` 共享下载/构建 artifact。每个 Environment 独立 installed packages，删除环境不删除缓存。Cache clear/自动 GC 本阶段未实现。

## Locks

Provider EX → Environment mutation lock → Build SH/EX；第一版 Provider 级保守串行化 Runtime/Provider/Environment 操作，防重型构建无限并发。没有 Repository/Worktree/Publication/Config 反向锁依赖。

现有 POSIX supervisor 继承 Provider FD，Backend 丢失后后代存活仍阻止资源回收；Build pin 是共享 FD，可并存，删除使用 EX。未来 Runner 必须继承 snapshot lease FD，不以 PID 或内存引用替代。

## Runtime References

默认 RuntimeReferenceService 必须包含 Environment/Revision/Build 来源，外加自定义来源，不可通过扩展点覆盖掉核心保护。Runtime FK RESTRICT；不自动级联删除环境。环境删除后，无其他定义/Build refs 才能移除 Runtime。

## Crash Recovery / Deletion

恢复复用 RuntimeOperation 的启动 reconciliation，取得 Provider EX 才能标 INTERRUPTED。Environment 恢复为旧健康 Current 或 ERROR，不运行网络/安装/自动 promote。

删除先取得全部 Build EX → DELETING → 验证并删 owned FS → DB 清理。部分删除失败保持 ERROR，避免把已失效 Current 根据旧缓存恢复成 READY；可重试。超时/取消完整进程组收敛仍由 Phase 6 supervisor 负责。

## Security

面板认证、/open 403、strict schema、静态错误、React 文本转义与原有流式 redactor。没有 arbitrary console/command/path/source、Secret index、Task ENV workaround。

**Python 包安装会以平台 OS 权限执行第三方构建代码；不是沙箱。** 隔离保证正常安装位置与平台操作边界，不防御同 UID 的持续恶意修改或恶意包任意文件访问。未泛化 import 所有 distribution。

## API

`/api/runtime/python/environments`：list/create/detail/metadata、revisions、build/rebuild、build verify/promote/delete、environment delete、clone、diff、freeze export、references、resolve、diagnostics、operations。取消和日志复用 `/runtime/python/operations/:id`。

定义保存与 build request 是两个步骤；如果保存后遇到 BUSY，定义保留，可刷新后显式 Rebuild。长操作返回 202 + operation ID。

## UI / Browser

现有 Runtime · Python 下增加 Versions / Environments；没有第二个顶层入口。Environment 列表、创建/Runtime选择、Dependencies、Build history、Diff、Promote、验证、删除、Clone、metadata、resolved/freeze、Operations 均可见。共用现有 Runtime Operation 日志/取消弹窗。

浏览器 37 步全部 PASS：从空 DATA_DIR 初始化到 Git/Subscription/ENV/Config/四阶段 Hooks/三语言执行、Runtime、Environment 创建、真实依赖构建、Diff/Promote/删除/引用保护、两次 Backend 重启与 Resolver。共审计 1,115 HTTP responses 和 26 WebSocket frames，无测试 Secret 泄漏。

旧 Provider 流程的 deterministic fixture 与新 Environment 使用的 **本次官方构建 CPython 3.13.15 prebuilt artifact** 明确分开；新的 venv、pip、wheel 操作均真实执行。fixture 只加速重复编译，production verifier 再检查 Runtime 身份；没有 fake API。源码下载阶段属于 Runtime provisioning，包安装只访问本地确定性 index。截图见 [Python Environments](diagnostics/phase7/browser-python-environments.png)。

## Legacy Python Dependency Bridge

**RETAINED**。B09/B10 Python prefix 安装仍由 `shell/start.sh`、当前 Python preload/Task 搜索路径、DependenceService/config util、旧 Python mirror 设置消费。不能因新环境存在便删除正在服务当前 Task 的依赖入口，也不能偷偷把 Task 绑定默认 Environment。Node/Linux legacy dependencies 保留。

## Shared Package Layer Decision

**DEFERRED**。第一版严格隔离，只共享 pip download cache。ABI/只读共享层/独立引用与优先级契约未实现，不以 PYTHONPATH、sitecustomize 或 system-site-packages 伪造。

## Platform Regression

保持旧 Git/Workspace/ENV/Config/Hook/B17/三语言 Task/取消恢复 gates；受保护 Task/Hook/Config/Dependency 执行文件相对 Phase 5 无变更。完整 release、真实 offline 和 fresh browser 分别留存证据，Linux run 仍 pending。

## Temporary Bridges

B01/B02/B03/B04/B06 SDK/依赖/信号、B07 Discovery、B08–B10、B11 内部设置、B12–B17 保留现行责任；B05 不恢复。没有新 Task bridge。B09/B10 Python 的退出需要 Phase 9 explicit binding + Phase 10 execution/import/recovery gates；Shared layer deferred 不影响该责任。

## Important Findings

1. venv 不可依赖目录搬移发布，必须稳定 generation 路径 + DB pointer。
2. 环境引用必须覆盖历史 Revision/Build，不能只数当前 Environment.runtime_id。
3. FD lease 与完整后代收敛是取消/恢复/删除安全的前提。
4. FS 删除成功、DB 未提交是独立故障窗口，必须保持 ERROR 并允许重试。
5. Runtime 全树摘要可验证正常 Environment 操作未污染解释器 package layer。
6. GitNexus CRITICAL 是影响范围提示，不是 Phase 6 未解决 blocker。最终相对 Phase 6 checkpoint 为 566 changed symbols / 30 affected flows；相对 develop 累计为 1,132 / 66。清单已补齐且无输出截断/查询 partial；索引仍有 861 entry points、864 callees 等追踪预算遗漏，人工边界审查与测试补充，不宣称图覆盖完整。详见 [Graph Review](diagnostics/phase7/GRAPH_REVIEW.md)。
7. 浏览器实测暴露 Diff 展开后的操作区不可滚动问题，已改为紧凑版本对比表与可滚动 Environment/Build 区域，重跑全链 PASS。

## Known Limitations

- Linux 实机未运行；53 项既有前端类型债务未清零。
- 私有认证 package registry、任意 index/proxy、VCS/local dependency 未支持；公开 PyPI 包安装 smoke 未运行（可选），核心包验收完全使用本地 index。
- Shared installed layer、automatic GC/cache clear、强制哈希 lockfile、Repository 自动发现未实现。
- 一个 Provider 串行操作；大的源码包仍依赖宿主已有 compiler/development libraries。
- Health 为缓存加轻量检查，完整依赖一致性以手动 Verify 为准；不是包内容的持续完整性证明。
- 所有权 sidecar 发布前中断可留下未登记目录，fail closed 等人工核对；不自动 adopt/delete。
- Build 为当前主机物化，不能承诺跨主机复制。Definition 是独有用户数据，venv 可重建；完整 Backup 留待后续。
- 当前 Task 仍用旧 Python dependency bridge，没有 Environment binding。

## Phase 8 Preconditions

建议下一阶段 **Phase 8 — Node Runtime + Dependency Environment**，复用不可变 Build、Desired/Resolved、统一 Operation、references/lease 契约。继续携带 Linux 与类型预算 gates，Task Resource Binding 留给 Phase 9。

**Phase 7 完成后 STOP；未进入 Phase 8/9/10。**
