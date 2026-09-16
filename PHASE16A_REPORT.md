# Phase 16A Status: PARTIAL

**WORKFLOW_IMPLEMENTED / FIRST_GITHUB_UBUNTU_RUN_ANALYZED / LINUX_FIX_VALIDATED_LOCALLY / HOSTED_FULL_REVALIDATION_PENDING**

本阶段建立 CI Foundation。首轮 GitHub Ubuntu Run [35078896295](https://github.com/anysoft/qinglong/actions/runs/35078896295) 已执行并分析：preflight PASS、core/managed FAIL、browser SKIPPED_BY_SCOPE。本轮在 Darwin arm64 修复并重新验证两个 fixture/CI 问题；完整 hosted 修复验证仍待新 SHA 的 workflow_dispatch full。Phase15 Linux Qualification 和 Temporary Bridge 删除未开始。

## 状态矩阵

| Item | Status |
|---|---|
| CI Script Foundation | PASS |
| Ubuntu Workflow | PASS — executed once |
| Ubuntu Preflight | PASS |
| Core Attempt #1 | FAIL — fixed locally |
| Managed Attempt #1 | FAIL — fixed locally |
| Browser Attempt #1 | SKIPPED_BY_SCOPE |
| TS Diagnostic Fix | PASS：排除 global runner；正式 suite 2/2 |
| Managed Clean Build Fix | PASS：owned clean checkout 自行 build → provision → 正式测试 |
| Artifact Collection / Secret Scrub | PASS：本轮 core / final regression / managed 均收集、扫描并清理 |
| Full Hosted Revalidation | PENDING |
| Phase15 Qualification | NOT STARTED |

## Linux Fix Attempt 1

首轮 SHA `a4e95c57302707994eb1d6c8b006146b36f374a4`。Ubuntu platform 467 / 466 pass / 1 fail / 0 skip；历史 22 项 TypeScript baseline 保持，Ubuntu remaining 4 / new 0 / raw failed / budget PASS。browser 因 normal scope 未执行，不是浏览器失败。

修复仅涉及 CI、diagnostic fixture 与测试：显式 fixture-local TS runner；managed 自行 backend build 并先于 provision；managed/browser 失败摘要复用阶段 JSON；按 job 修正显式 artifact 路径。新增回归均先在旧代码下复现，再验证修复。安全边界、生产模型、Runner、otask 与 Temporary Bridges 不变。

### 本轮已完成的本地验证

Darwin arm64 / host Node22.23.2。完整 core：**469 tests / 466 pass / 0 fail / 3 原有 Darwin skip**（新增 2 项 CI 回归，未删测试）。CI foundation **11/11**；focused environment-execution **2/2**；后端/前端构建 PASS。TypeScript **22 historical / 22 remaining / 0 new**，raw tsc 仍失败，budget PASS，原 baseline 字节未改。

静态审计 PASS：权限 contents:read、0 custom secrets、artifact 显式路径、managed build 前置、无全局 TS/PATH workaround；正常 otask 返回 64 / LEGACY_EXECUTION_DISABLED。Bash syntax PASS；Darwin 未安装 ShellCheck，Ubuntu 仍强制执行，未冒称本机 ShellCheck PASS。Core canary、私钥、尺寸/路径边界及 owned cleanup 均 PASS。

证据：[core-validation.json](diagnostics/phase16a/linux-fix/core-validation.json)、[TS resolution](diagnostics/phase16a/linux-fix/ts-resolution.json)、[core-summary](diagnostics/phase16a/linux-fix/core-evidence/core-summary.json)、[static audit](diagnostics/phase16a/linux-fix/core-evidence/static/audit.json)。本轮生成包文件名使用工作树基准 SHA，不表示修复已提交；本轮未 commit / push。

### 本轮真实 managed 隔离验证

独立 owned checkout 从 **static/build 不存在**开始，通过 CI managed 入口自行构建 taskRunSubmit，然后 provision CPython3.13.15 / Node24.21.0。**Environment 3/3、managed execution 2/2（Python、Node CJS/ESM、真实 tsx）、Shell 5/5**。正式 Runtime VERIFY/REMOVE、canary/私钥/尺寸检查、artifact 打包、owned 根与 checkout 删除全部 PASS。

[clean-state.json](diagnostics/phase16a/linux-fix/managed/clean-state.json) 记录 `static_build_preexisting=false`、`backend_build_executed=true`、`task_run_submit_exists_after_build=true`、`build_before_provision=true`；[managed-summary](diagnostics/phase16a/linux-fix/managed/evidence/managed-summary.json) 保留逐阶段时间与实际计数。

边界：Darwin 实际执行 `scripts/ci/test-managed-runtime.sh`（run-job 安装后的同一 managed phase）；隔离 checkout 复用已安装 node_modules，未复制 static/build、未手工预先 build、未复用 host Task Runtime。Ubuntu 的完整 `run-job.sh` apt/preflight/依赖安装入口仍须新 hosted full run 验证；本轮未重新跑 browser 业务 harness，已验证共享 build 和失败摘要，browser full acceptance 仍待 hosted。

最终增加 TAP 完整性保护后再次执行 platform，仍为 469 / 466 / 0 / 3；CI 自测 11/11，含“子进程 exit0 但无 TAP 计数不得 PASS”。[最终回归](diagnostics/phase16a/linux-fix/final-validation.json) 和 [本轮统一机器报告](diagnostics/phase16a/linux-fix/local-validation.json) 记录所有结果及三份本地诊断包的 SHA256。

GitNexus 在当前 develop/worktree 上强制重建。定点 impact 的 buildBackend/buildFrontend/build/stageEvidence/managed/browser 为 LOW，调用范围集中 CI。detect_changes 已对 HEAD、develop 执行；当前索引的流程预算有截断提示，不能把图中未出现流程解释为无影响，已用调用搜索、完整回归和保护文件 hash 审计补充。无生产 back/src/shell 变更，baseline/锁文件/bridge 均未改。

本轮状态：**LOCAL_FIX_VALIDATED / HOSTED_FULL_REVALIDATION_REQUIRED**。未创建 commit，未 push，未触发或重跑 hosted workflow。Phase15 和 Phase16B 未开始。

完整首轮分析、修复与复验流程：[linux-fix-attempt1.md](diagnostics/phase16a/linux-fix-attempt1.md)。本轮新证据只写入 `diagnostics/phase16a/linux-fix/`，下文初版历史证据保留。

## Workflow 与范围

入口：`.github/workflows/linux-ci.yml`。所有 job 固定 `ubuntu-24.04`，host Node 固定 `22.23.2`。图为 `preflight → core / managed-runtime / browser → ci-summary`。

- PR、`codex/**` push：core；main/master/develop push：core + managed-runtime。
- `workflow_dispatch`：normal/core 或 full/全部，默认 full。
- `workflow_call`：同一编排，默认 full，供 Phase15 使用。
- normal 同 ref 的旧运行可取消；full 保留独立 run。每 job 有显式超时。
- 旧 validate workflow 为 REPLACE/MERGE；旧 Docker/镜像同步 workflow 为 ARCHIVE。原文逐字保留于 `.github/archived-workflows/*.disabled`，避免推送 CI 分支意外发布。现有 provenance 断言继续检查归档内容，并断言发布 workflow 未激活。

没有新增 Docker、DockerHub、GitHub Release 或部署。B03/B04、B09/B10、B13/B14/B17 和 Linux 待资格验证材料保持；B01 Editor、B16 正常 Backup 路径的已移除状态保持。

## 执行与隔离

`scripts/ci/run-job.sh JOB` 管理安装、测试、失败诊断、清理及打包。拆分入口包含 preflight、install-dependencies、build、test-core、test-managed-runtime、test-browser、test-static、collect-diagnostics、cleanup、package-artifacts。

系统包包含构建工具链、OpenSSL/SQLite/zlib/bz2/lzma/ffi/readline 等开发库、Git/SSH、Python3、curl、tar/xz/gzip、util-linux flock、GNU coreutils timeout、sqlite3、ShellCheck。apt 有私有锁目录、包状态检查与失败退出；系统包安装不能完全事务回滚。Node 工具在独立锁文件中固定 pnpm8.3.1 / Playwright1.58.2 / ssh2 1.17.0，`npm ci` 后执行项目 `pnpm install --frozen-lockfile`，不修改主锁文件。

每 job 建立随机 0700 临时根、独立 HOME/TMPDIR/QL_DIR、DB、SSH fixture、runtime 与 canary registry。配置输出路径限定 diagnostics/系统临时目录，拒绝 `..` 与 symlink。诊断文件 0600，测试子进程 umask022 保留真实文件 mode 语义。没有 operational DATA_DIR、runtime、node_modules、SSH key 或 backup cache，也不跨 job 共享运行数据。

Core：backend build → frontend build → `tests/platform/run.cjs` → 精确 TypeScript baseline → CI 自测/静态审计。历史 22 项错误按规范化诊断签名计数，新错误不允许进入 baseline。Ubuntu 上任何 skip 均失败；Darwin 仅保留原有 3 项 Linux 条件 skip。

Managed：独立 backend build 完成后，正式 provider 安装/校验 CPython 与 Node，复用 Phase7/8 环境生命周期、Phase10 managed Python/Node/TypeScript 与 Shell 测试。真实 Runtime 解释器执行 Task；host Python/Node 仅用于工具和监督。浏览器复用刚验证的官方 runtime 安装作为原有 provider fixture 输入，明确不把 host Runtime 冒充 managed Runtime。

Browser：优先 runner 已有 Chrome，否则安装锁定 Playwright 配套 Chromium；执行 Phase12 Workspace/Git 与 Phase14 Runtime/ENV/Config/Hook/Task/Trigger/Observability/Backup/Restore 完整场景。输出目录可配置，新增 console/network 记录、秘密遮罩截图与 PID 登记；CLI portable passphrase 通过 stdin，不写口令文件。

## 诊断与安全

每 job 上传 `linux-<job>-<run-id>-<sha>`，内部为 `phase16a-<job>-<run-id>-<short-sha>.tar.gz`；保留 30 天。安全目录是 `ci-artifacts/<job>-<run-id>/`，含 ci-summary、preflight、logs、tests、runtime、browser、static、cleanup。Git status、磁盘/内存、版本、构建/测试/操作日志、失败截图及 console/network 均有明确来源。

只允许 JSON/log/txt/PNG，拒绝 symlink/hardlink、操作数据库与其他文件类型；总上限 64 MiB。单阶段日志触顶会记录 truncated 并失败，不静默丢弃。收集时扫描随机 ENV/Config/Notification/Webhook/JWT/SSH canary、固定测试 canary 和私钥 PEM 标记；失败不复制原始材料、不生成可上传包，并移除同 run 旧包。截图预先遮罩输入、编辑器、对话框和已登记秘密。不会收集 node_modules、运行时二进制、DB、密钥、备份明文或密文包。

正常与失败路径都会运行收集/清理；workflow 另设 `always()` 恢复步骤和 artifact upload。清理由 owner token、PID 启动时间、父子关系与进程组约束，只终止所属进程；后台服务/浏览器独立进程也登记。正式 Runtime VERIFY/REMOVE 后删除自己的临时根。清理失败使 job 非零。

`ci-summary` 使用 needs 实际结果，区别 scope skip、依赖阻断、取消、测试失败和 `ARTIFACT_UPLOAD_FAILED`；从实际 TAP 读取测试数。成功 core 缺少报告也失败。输出 `$GITHUB_STEP_SUMMARY` 和 `diagnostics/ci/final-summary.json`，下载的 tar 不解包。权限只有 contents:read，checkout 不保留 credential，0 自定义 secrets；无 pull_request_target，不插值执行 PR title/body/branch。

## 初版本机历史验证（首次 hosted run 之前）

本节保留初版验证事实；不作为本轮修复的新测试结果。所有数值仅代表 Darwin，不替代 Linux。

| 验证 | 实际结果 |
|---|---|
| Backend / frontend build | PASS / PASS |
| 全量 platform | 467 tests / 464 pass / 0 fail / 3 Darwin skip |
| TypeScript | 22 historical / 22 remaining / 0 new |
| CI foundation | 9/9 PASS，含失败打包、canary、边界与 detached 子进程清理 |
| Summary CLI fixtures | 6/6 PASS，明确是 fixture，不是 hosted execution |
| Managed environment | 3/3 PASS |
| Managed Python / Node / TypeScript Runner | 2/2 PASS |
| Shell Runner | 5/5 PASS |
| 历史报告中断恢复 journal | PASS：字节恢复、幂等与 foreign root 拒绝 |
| Phase12 browser | PASS，233 API responses、8 WebSocket frames、0 leaks |
| Phase14 browser | PASS，1507 API responses、115 WebSocket frames、63 Run log frames；秘密审计通过 |
| 正式 Runtime VERIFY / REMOVE | PASS：CPython 3.13.15、Node.js 24.21.0 |
| 最终 canary / package / cleanup | PASS：owned 临时根已删除 |
| YAML / Bash syntax / artifact path security | PASS |
| ShellCheck / actionlint | 本机不可用；Linux CI 安装并强制 ShellCheck |
| Darwin preflight | 按设计拒绝，UBUNTU_24_04_PREFLIGHT_REQUIRED |

初轮发现并修复了 CI umask 导致的三项 mode 断言失败、归档 workflow 路径断言、浏览器首次文件读取的显式 REPOSITORY_BUSY 竞争、preload 随 execArgv 进入隔离 crash worker、随机 hook canary 必须保持运行时拼接而不能作为完整命令字面量。未跳过相关测试，也未改变生产权限、锁或恢复语义。失败尝试的安全日志与浏览器证据保留在本机 browser artifact 中。

GitNexus 索引已刷新。新 CI run() 影响报告 HIGH（20 直接调用、1 flow、2 modules）；其中存在同名历史 harness 的保守匹配，人工复核真实 import/call 链集中于 CI 执行器。其他已解析的新 CI 符号为 LOW；匿名/歧义符号和截断执行流不能据图推断“无影响”。GitNexus 对索引条数/流程预算有截断提示，补以实际全量测试、局部调用检查和最终 diff 复核。`detect_changes` 最终相对 HEAD 为 HIGH / 8 flows（CI execution、artifact pipeline、browser acceptance）；相对 develop 为 CRITICAL / 359 flows（累计多个阶段，截断），不能将后者当作仅本阶段影响。一次增量索引产生了将 flushBrowser 关联生产路由的异常结果，已保存为 graph-review-incremental-*；强制 graph/FTS 重建并禁用 parse cache 后异常消失，最终报告为 graph-review-HEAD/develop.json。

### 证据入口

- [本机机器报告](diagnostics/phase16a/local-validation.json)：明确标记 Darwin / GitHub pending，包含版本、结果、清理状态和包 SHA256。
- [Core 摘要](diagnostics/phase16a/core-core-summary.json)、[Managed 摘要](diagnostics/phase16a/managed-summary.json)、[Phase12 browser](diagnostics/phase16a/browser-phase12.json)、[Phase14 browser](diagnostics/phase16a/browser-phase14.json)。
- [Workflow 安全检查](diagnostics/phase16a/security-audit.json)、[Summary CLI fixtures](diagnostics/phase16a/summary-generator.json)、[CI 自测](diagnostics/phase16a/ci-tests.log)。
- [本机 core 包](ci-packages/phase16a-core-1789546202617-e27f2380905a.tar.gz)（31,012 bytes）、[本机 browser + managed 包](ci-packages/phase16a-browser-1789546202827-e27f2380905a.tar.gz)（3,381,857 bytes）。本机为节约重复下载在一个私有 fixture 中顺序验证 managed 与 browser；GitHub 两个 job 各自独立 provision。

这些 tar 是本机已扫描的诊断文件，不是 GitHub-hosted artifact 或 Release。生成包被 gitignore 排除，保留在当前工作区。

## 使用与后续边界

在 Ubuntu24.04 + Node22 环境执行：

```bash
scripts/ci/run-job.sh core
CI_OUTPUT="$PWD/diagnostics/ci/runtime-run" scripts/ci/run-job.sh managed-runtime
CI_OUTPUT="$PWD/diagnostics/ci/browser-run" scripts/ci/run-job.sh browser
```

每次独立运行选择新 CI_OUTPUT。详细脚本、依赖、矩阵、安全和复现说明位于 `docs/refactor/phase16a/01..10`。

用户提交并推送本轮修复后，必须在 GitHub Actions 手动执行 scope=full，下载 job artifacts 与 linux-summary；不要重跑旧 Run 验证新代码。新 workflow 的 UI 手动发现受默认分支注册规则约束。首轮 Run 为 **35078896295**，结果与本轮修复见上文；新 SHA 的 full Run 尚未执行。当前不能确认 Linux flock/FD、GNU timeout、renameat2、SIGKILL、Unix socket 或 hosted runner 网络/资源行为；Phase15 应以真实 Ubuntu artifacts 完成资格验证。本阶段在 Phase16A 停止。
