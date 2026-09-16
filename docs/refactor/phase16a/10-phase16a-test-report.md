# Phase16A validation

## 初版历史验证（首次 hosted run 前）

详细最终状态见根PHASE16A_REPORT.md。CI自身测试包括失败仍收集打包、canary阻止发布与旧包失效、随机秘密/private key、路径/类型/尺寸边界、owned清理幂等、detached孙进程超时清理、真实TAP汇总与上传失败、workflow解析及权限审计；纳入正式platform manifest。

本机只证明Darwin上的脚本/构建/回归与可运行harness。Ubuntu24.04、apt、Linux特有flock/timeout/renameat2必须在GitHub真正运行后才可记录结果；无Run URL时明确GITHUB_HOSTED_RUNNER_NOT_YET_EXECUTED，不把workflow配置标作Linux PASS。

本机最终core：467 tests / 464 pass / 0 fail / 3 Darwin skip；TypeScript 22 historical / 0 new。CI foundation 9/9，summary CLI fixture 6/6，managed environments 3/3，managed Runner 2/2，Shell 5/5。Browser与清理的最终结果及证据链接统一见根报告。

最终Phase12/Phase14 Browser均PASS；正式Runtime VERIFY/REMOVE、canary扫描与owned根删除均PASS。实际Node24.21.0、CPython3.13.15；机器报告diagnostics/phase16a/local-validation.json，GitHub状态仍pending。


## First Hosted Run

Run [35078896295](https://github.com/anysoft/qinglong/actions/runs/35078896295)，SHA `a4e95c57302707994eb1d6c8b006146b36f374a4`，Ubuntu24.04.5 x86_64 / Node22.23.2。preflight PASS；core 467 / 466 pass / 1 fail / 0 skip；managed FAIL；browser SKIPPED_BY_SCOPE（develop push normal）；ci-summary FAIL。Ubuntu TypeScript historical22 / remaining4 / new0 / raw failed / budget PASS。

## Root Cause / Linux Fix

- Core：diagnostic frozen PATH 错误依赖 global ts-node；只在 snapshot-main fixture 前置 `__dirname` 定位的 repo-local bin。最小 PATH 回归保留四语言安全断言并核对实际 runner 路径。
- Managed：独立 job 未 backend build；拆分 backend/frontend，managed 在 provision 前自行运行真实后端编译。owned checkout 自测不复制/mock taskRunSubmit；另跑真实 managed phase。
- 失败摘要：managed/browser finally 写入已有 stage JSON 的汇总，保留 failed_stage/NOT_RUN；artifact 显式路径按 job 修正，tar/ci-summary/安全约束保持。
- 旧代码失败证据与本轮完整结果见 [attempt1](../../../diagnostics/phase16a/linux-fix-attempt1.md)；机器证据在 `diagnostics/phase16a/linux-fix/`，初版证据未覆盖。

## Linux Fix Local Revalidation

Darwin arm64 / Node22.23.2：focused 2/2；CI foundation 11/11；最终 platform 469 / 466 pass / 0 fail / 3 原有 Darwin skip。backend/frontend PASS；TypeScript historical22 / remaining22 / new0 / budget PASS，baseline未改。

Owned clean checkout 自行 backend build 后完成真实 provider provision；environment 3/3、managed Python/Node/tsx execution 2/2、Shell 5/5。Runtime VERIFY/REMOVE、owned root/checkout 删除、canary/私钥扫描和打包 PASS。Ubuntu apt/preflight/install 入口仍待 hosted full；本机执行其安装后的同一 managed phase，不复用 static/build。最终完整回归包含 exit0 但缺 TAP 的失败摘要保护。机器汇总：[local-validation.json](../../../diagnostics/phase16a/linux-fix/local-validation.json)。

本轮 `LOCAL_FIX_VALIDATED / HOSTED_FULL_REVALIDATION_REQUIRED`；主报告 PARTIAL；未 commit / push。

## Revalidation Procedure

本地结果不代表 hosted full PASS。用户提交/push 后手动运行 `Linux CI Foundation`，`scope=full`，提供**新的 Run ID / SHA**。不得重跑旧 Run 35078896295 代替新代码验证；normal develop push 也不能覆盖 browser gate。五个 job 全部实际 PASS 后再讨论 Phase15，当前 Phase16A 仍为 PARTIAL，qualification 保持 NOT_PHASE15_QUALIFICATION。
