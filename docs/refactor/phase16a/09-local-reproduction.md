# Local Ubuntu reproduction

要求Ubuntu24.04、Node22.23.2、npm、Python3（启动进程监督器）与sudo非交互安装权限；不需要Docker。完整job与Actions相同：

```bash
scripts/ci/run-job.sh core
```

每个独立job使用新输出位置（临时操作根由脚本自动mktemp生成0700）：

```bash
CI_OUTPUT="$PWD/diagnostics/ci/runtime-run" scripts/ci/run-job.sh managed-runtime
CI_OUTPUT="$PWD/diagnostics/ci/browser-run" scripts/ci/run-job.sh browser
```

分步调试时先install-dependencies.sh system，再install-dependencies.sh、preflight-linux.sh及相应test脚本。结束前collect-diagnostics.sh、cleanup.sh、package-artifacts.sh；建议完整run-job由finally处理失败。不要并发build与依赖static/build的测试。

每个CI_OUTPUT代表一次执行，不复用已清理的状态；需要重跑时选新CI_OUTPUT。临时根、私有canary registry、测试DB均不在仓库data/。apt安装修改系统包且不可完全回滚；项目依赖遵守锁文件，不修改系统Git identity或全局语言包。

GitHub：推送分支后在Actions选择Linux CI Foundation，Run workflow→scope full，下载各job artifact及linux-summary。首次新workflow需要进入GitHub可发现的分支/default branch，才能从界面手动选择；本次不代用户push。

artifact目录按job+run ID隔离，重复运行保留旧证据，不覆盖或删除旧目录。
