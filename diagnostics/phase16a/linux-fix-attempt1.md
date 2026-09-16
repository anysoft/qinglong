# Phase16A — First Hosted Run / Linux Fix Attempt 1

## First Hosted Run

- Run: [35078896295](https://github.com/anysoft/qinglong/actions/runs/35078896295)
- SHA: `a4e95c57302707994eb1d6c8b006146b36f374a4`; `develop` push / `CI_SCOPE=normal`.
- 用户提供的 runner/artifact 证据：Ubuntu 24.04.5 x86_64、kernel 6.17.0-1022-azure、Node 22.23.2。
- Artifacts: preflight `10438728142`、core `10439791077`、managed `10439214385`、summary `10440100345`。
- Run SHA、事件与各 job conclusion 已由公开 GitHub REST API 独立核对，见 [hosted-attempt1.json](linux-fix/hosted-attempt1.json)。详细测试计数/错误来自用户提供的首轮 artifact 摘要；本轮未冒称重新下载过认证 artifact。

| Job | Attempt #1 |
|---|---|
| preflight | PASS |
| core | FAIL：467 tests / 466 pass / 1 fail / 0 skip |
| managed-runtime | FAIL：environment 已完成，两个 execution 测试缺少后端产物；Shell 未到达 |
| browser | SKIPPED_BY_SCOPE：develop push normal 的设计行为 |
| ci-summary | FAIL：正确保留失败与 scope skip |

Ubuntu 三项原 Darwin 条件 skip 均已真实执行，不能新增 Linux skip。Ubuntu TypeScript 为 historical 22 / remaining 4 / new 0 / raw failed / budget PASS；保留 22 项原 baseline。

## Root Cause / Fix

### 1. Diagnostic TypeScript resolution

直接启动 `tests/phase5/snapshot-main.cjs` 不经过 npm/pnpm，原 frozen PATH 仅复制 host PATH；clean runner 无 `ts-node-transpile-only`，由 `shell/otask.sh:172` 返回 127。

仅在该 diagnostic fixture 的 frozen child PATH 前置由 `__dirname` 推导的仓库 `node_modules/.bin`。不修改 shell bridge、正式 ExecutionContext、Runner、managed Runtime，也不全局安装 ts-node 或修改 job PATH。

正式 environment-execution suite 使用独立 host-bin（当前 Node、Python3）及系统目录，断言进入 fixture 前无法解析 ts-node；实际 TypeScript child 内的 `command -v` 必须等于仓库本地 runner。Python/Node/Shell/TypeScript 原有安全断言全部保留。旧实现确实失败于 exit127，见 [ts-before.log](linux-fix/ts-before.log)。

### 2. Managed job backend prerequisite

各 hosted job 独立 checkout。原 managed 直接 provision，错误依赖其他运行残留的 `static/build/taskRunSubmit.js`。这是 CI 隔离前置条件缺失。

拆分 `buildBackend` / `buildFrontend`：core、browser 继续完整 build；managed 首先 backend build，然后 Python/Node provision、environment、execution、Shell。没有 frontend managed build、跨 job build artifact、`needs: core` 或串行化。

CI self-test 从 owned checkout 的 `static/build` 不存在开始，运行真实 `scripts/build-back.cjs`，进入 provision 前断言产物与阶段 PASS。仅将 provision 替换为受监督的失败子进程，以离线测试失败摘要；不 mock/复制 taskRunSubmit。旧实现失败于 `taskRunSubmit missing before provision`，见 [managed-before.log](linux-fix/managed-before.log)。完整真实 managed 验证另在独立 checkout 执行。

### 3. Summary / artifacts

managed/browser 用 `finally` 写摘要，读取已有 `tests/<stage>.json`，包括 backend、environment、execution、Shell 与 failed_stage。未运行阶段标为 NOT_RUN。CI 自测覆盖 provision 失败以及 managed/browser 的 backend 失败。浏览器业务 harness 未改变。

Workflow 显式上传分别使用 preflight.json、core-summary.json、managed-summary.json、browser-summary.json；保留 ci-summary、完整 tar、always upload 与 30 天 retention。只读权限、无自定义 secrets、checkout 不保留 credentials、安全扫描与 owned cleanup 保持。

## Local verification

本机 Darwin arm64 / Node22.23.2；所有新证据写入 `linux-fix/`，初版证据保持原样。

| Gate | 本轮实际结果 |
|---|---|
| Focused environment-execution | 2/2 PASS；旧代码 TS exit127，修复后仓库 runner |
| CI foundation | 11/11 PASS，含真实 clean backend compile、build/provision 失败摘要、exit0 无 TAP 拒绝 |
| Final platform | 469 tests / 466 pass / 0 fail / 3 原有 Darwin skip |
| Backend / frontend | PASS / PASS |
| TypeScript budget | historical22 / remaining22 / new0 / raw failed / budget PASS |
| Managed environment | 3/3 PASS |
| Managed execution | 2/2 PASS：Python / Node CJS / ESM / real tsx |
| Shell | 5/5 PASS |
| Legacy normal guard | exit64 / LEGACY_EXECUTION_DISABLED |
| Static | PASS；Darwin ShellCheck unavailable，Ubuntu 仍强制 |
| Runtime VERIFY/REMOVE + owned cleanup | PASS |
| Artifact collection / secret scrub | PASS：core、最终回归、managed 三份安全诊断包 |

机器证据：[统一报告](linux-fix/local-validation.json)、[TS 路径](linux-fix/ts-resolution.json)、[clean managed](linux-fix/managed/clean-state.json)、[最终 platform](linux-fix/final-validation.json)、[保护文件审计](linux-fix/scope-audit.json)。两个根因均在旧实现上真实复现；managed self-test 确实调用真实 compiler，没有 mock taskRunSubmit。

真实 managed 验证使用新 owned checkout，起点 static/build 不存在，依赖仅复用已安装 node_modules；通过 `scripts/ci/test-managed-runtime.sh` 调用 run-job 安装后的同一 managed phase。机器证据证明 backend 自行生成且先于 provision，环境/执行/Shell 全 PASS。Darwin 不具备 Ubuntu apt/preflight，因此没有冒称完整 Ubuntu `scripts/ci/run-job.sh managed-runtime` 本机 PASS。browser harness 本轮未重跑，共享构建与失败摘要已测试，完整 hosted browser 仍待执行。

状态：`LOCAL_FIX_VALIDATED / HOSTED_FULL_REVALIDATION_REQUIRED`。未 commit / push，未启动 Phase15/16B。

## Revalidation procedure / pending gate

本地修复不能把 Phase16A 改成 PASS。状态需保持 `PARTIAL`，等待新的 SHA 对应的新 Run：

1. 用户提交并 push 修复。
2. `Linux CI Foundation → Run workflow → scope=full`。
3. 提供新的 Run ID；确认 preflight/core/managed-runtime/browser/ci-summary 全部实际执行且 PASS。
4. Linux platform 要求 0 fail / 0 skip；managed 必须执行 backend/provision/environment/execution/Shell/cleanup；browser 必须实际执行 Phase12/14。

不要 Re-run 旧 Run `35078896295` 作为修复验证，它仍绑定旧 SHA。develop push 的 normal run 不能替代 full。qualification 保持 `NOT_PHASE15_QUALIFICATION`；Phase15 / Phase16B 未开始。
