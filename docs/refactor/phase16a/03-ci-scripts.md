# Repository entrypoints

所有.sh为Bash strict mode；common.sh固定仓库根并禁止秘密追踪。Node辅助模块负责结构化报告、执行监督、路径校验及归档。

| Script | Responsibility |
|---|---|
| run-job.sh JOB | 完整生命周期；失败仍收集、清理、打包 |
| install-dependencies.sh system | 幂等apt依赖 |
| install-dependencies.sh | 独立工具npm ci + 项目pnpm frozen-lockfile |
| preflight-linux.sh | 必需工具/Ubuntu24.04探测 |
| build.sh | backend完成后frontend；测试期间不重建static/build |
| test-core.sh | build、全manifest、typecheck预算、CI自测和静态检查 |
| test-managed-runtime.sh | 真实安装、环境、Runner、Shell |
| test-browser.sh | build、同job真实运行时、Phase12/14完整harness |
| collect-diagnostics.sh | allowlist、安全检查、全部安全后发布 |
| cleanup.sh | 正式Runtime清理后验证owner，清理自己登记的进程及临时根 |
| package-artifacts.sh | 仅打包已审计目录 |

工具依赖独立scripts/ci/tools/package-lock.json（pnpm8.3.1、Playwright1.58.2、ssh2 1.17.0），不修改项目锁。项目严格pnpm-lock.yaml。没有运行时/数据缓存。流程失败返回非零，不把网络故障变成skip。

私有根0700、报告0600；测试子进程umask022，保持原有文件mode测试语义，私有父目录仍隔离数据。CI_OUTPUT须为diagnostics或系统临时目录下的绝对路径，拒绝..与symlink路径。
