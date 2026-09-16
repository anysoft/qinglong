# Phase 14 continuation verification

以仓库根 PHASE14_REPORT.md 与 diagnostics/phase14 的最终日志为准。早期 foundation 的 410 PASS 不是 continuation 的产品验收。

当前新增正式测试包含：真实 SQLite/Git snapshot → encrypted export → source destruction → new-root offline restore；七个 SIGKILL 点；失败后 rollback；mode/symlink/dirty/local refs；篡改与目录替换；嵌套与继承 FD lifetime；100k Run + 100 MiB log + 2000 Git files/RSS。

浏览器 harness 使用真实 fresh app、HTTP、SQLite、Git SSH、secret Config/ENV、Hook、Task、Trigger、notification receiver。CPython/Node 从官方安装器建立并验证的受控本地 artifact 复用，venv/package environment 正式构建；不是宿主解释器 fallback。恢复阶段 origin 不可用，之后才显式 rebuild 与复验。

所有生产测试须纳入 tests/platform/test-baseline.json。Backend/Frontend build、frontend typecheck 相对 32 条历史基线、static secret/path audit、GitNexus compare review 是独立 gate。Linux 不以 Darwin 测试冒充。

追加边界测试：客户端断开时的异步 route handler 租约；口令早期失败清理和无 partial export；Config/Git 对象损坏；Run 日志路径类型；真实应用坏 journal 启动拒绝；空目标恢复；失败重建资源可见且不能误报成功；Python 物理 provider 与 Node 逻辑 provider 的状态区分。

浏览器 Trigger 比较保留 ID、类型、Cron expression/timezone/misfire policy、Webhook public ID/secret 使用能力与 Git watermark。Cron 的运行时间戳允许按既有 scheduler/misfire 规则推进，不以启动后逐字相等作为配置保留的判据。已验证保留的夹具 dirty/untracked 文件，只在后续主动 Git 同步复验前由夹具显式清理。

## Reproduce

使用项目 Node 22 / 已安装依赖；浏览器依赖目录由 `QL_BROWSER_RUNTIME` 指定，需含 Playwright 与 ssh2。Darwin harness 使用已安装 Chrome。先完成 build，再启动 tests/app；backend build 会重建 static/build，不能在测试/服务运行时并行执行。

```sh
node scripts/build-back.cjs
./node_modules/.bin/max build
node tests/platform/run.cjs
node diagnostics/phase14/check-typecheck.cjs
node diagnostics/phase14/prepare-resources.cjs
node diagnostics/phase14/platform-e2e.cjs
node diagnostics/phase14/cleanup-managed-fixtures.cjs
node diagnostics/phase14/static-audit.cjs
```

prepare-resources 会真实联网安装官方运行时并保存其 owned fixture；cleanup 已在本次验收后执行，因此重跑浏览器前必须重新 prepare。不要复用报告里已经标记 fixture_removed 的旧临时路径。

## Final result

438 tests / 435 passed / 0 failed / 3 Darwin skips；Browser/Fresh recovery 53 steps PASS；Backend/Frontend build PASS；Typecheck 32 historical / 0 new；Static audit PASS。完整结果见 `diagnostics/phase14/final-gates.json` 与根报告。规模 gate：100k Runs / 100 MiB log / 2000 Git files，49,840 ms，RSS peak 390,971,392 bytes（974 samples）。唯一待资格验证项是 Linux / Phase 15。
