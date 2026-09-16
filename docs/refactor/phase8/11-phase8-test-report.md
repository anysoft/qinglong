# Phase 8 验证与复现

最终状态及证据索引以根目录 PHASE8_REPORT.md 为准。所有执行应使用项目 Node 22 与 pnpm 8.3.1；默认开发宿主 Node 26 不兼容当前 SQLite/Sequelize 测试栈。

基础门禁：node tests/platform/run.cjs；node diagnostics/phase8/static-audit.cjs；node diagnostics/phase8/check-typecheck.cjs；node scripts/build-back.cjs；max build。

实网 Node fixture：node diagnostics/phase8/prepare-managed-node.cjs；随后串行执行 node --test tests/phase8/offline.test.cjs 和 lifecycle.test.cjs。实际 managed pnpm/npm 对本地 registry 安装真实包，覆盖 scoped/transitive、ALLOW/IGNORE、frozen/re-resolve、Diff/Promote、锁、取消、timeout、SIGKILL/restart。不能用 adapter unit fixture 冒充这两项。

Python：node diagnostics/phase8/prepare-managed-python.cjs 后，以 QL_PHASE7_MANAGED_ROOT 指向结果 root 运行 tests/phase7/offline.test.cjs。浏览器：node diagnostics/phase8/platform-e2e.cjs，包含空 DATA、Git、ENV、Config、Hooks、Python+Node、重启和真实 UI 操作。

Provider unit tests 用真实 curl 访问本地 checksum/slow fixture，验证校验失败和取消；archive tests 检查恶意成员；API tests 验证严格字段与访问边界；failure tests 注入 publish/磁盘/cleanup 故障。最终测试不新增 skip。

Linux Validate workflow 配置实网 provision + local registry + process lifecycle + full fresh browser；当前没有远端 CI 执行结果，必须记 PARTIAL。fixture 用完只清理本次 manifest 指定的私有 tmp root，保留日志与来源 metadata。
