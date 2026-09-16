# Phase 7 validation

## Final results

- Release：338 tests / 335 passed / 0 failed / 3 existing skips。
- Mandatory real offline pip：1 passed / 0 failed；真实 Runtime 整树摘要保持不变，取消/崩溃后的抗 TERM package 子进程实际退出。
- Browser/fresh：37 steps PASS；1,115 HTTP responses + 26 WebSocket frames，未发现测试 Secret。
- Backend/Frontend build：exit 0；Typecheck 53 existing / 0 new；Static 325 files / 0 forbidden。
- Runtime final Verify/Remove：SUCCESS / exit 0，remaining=0，owned fixture 已清理。
- Linux：PARTIAL，无实机 run；公开 PyPI package smoke 未运行，属于可选网络验证。

## Gates

- 确定性 release gate：`node tests/platform/run.cjs`，保留全部 Phase 4.5/5/6 活跃测试，新增 Phase 7 schema/API/path/fault cases。最终计数见 `diagnostics/phase7/platform-tests.log`。
- 必须的真实离线包 gate：先 `node diagnostics/phase7/prepare-managed-runtime.cjs [verified-official-source.tar.xz]` 配置官方 pyenv/managed CPython，再 `node --test tests/phase7/offline.test.cjs`。后者只访问 stdlib 构建的本地 wheel/sdist index，包 release gate 不依赖 PyPI。
- Browser：`node diagnostics/phase7/platform-e2e.cjs`（或 `npm run test:platform:e2e`），需要已生成的 managed fixture。真实 Backend 与浏览器，旧 Runtime 生命周期使用明确 fixture；新 Environment 使用本次官方 managed CPython 的 prebuilt artifact，production verifier 再验证绝对 prefix/identity；真实 venv/pip/local wheels。没有 fake API。
- Backend：`node scripts/build-back.cjs`；Frontend：`node node_modules/@umijs/max/bin/max.js build`。
- Type budget：`node diagnostics/phase7/check-typecheck.cjs`，53 existing / 0 new；后端编译单独要求零错误。
- Static：`node diagnostics/phase7/static-audit.cjs`，每个 Python package/search-path 引用归类 domain 或桥；新域 forbidden=0。

本机 Node 26 下既有 SQLite/Sequelize 不兼容，所有 Node Gate 使用 Node 22：`npx --yes --package=node@22 -c 'node ...'`。不要使用不匹配项目版本的全局 pnpm。所有 builds 必须在使用 static symlink 的测试/浏览器开始之前完成。

## Coverage

冻结 v3 演化、fresh 对齐、老 ENV/Config/Hooks/Runtime/history 保留、晚期 DDL rollback；PEP 508/extras/markers/duplicate/injection；路径symlink/dev/ino/未知文件保护；Runtime/Built refs；多 SH pins；真实 wheel direct/transitive snapshots；Current 内容不可变；依赖冲突/PEP517失败；TERM-resistant 子进程取消与 Backend SIGKILL恢复；Timeout/ENOSPC注入；删除部分失败重试；发布事务失败不切 Current；Clone、Diff、Promote、Rebuild、restart Resolver；Runtime 全树内容摘要前后相同。

输出证据：platform-tests.log、offline-tests.log、offline-result.json、managed-runtime/result.json、platform-e2e.json、browser-python-environments.png、backend-build.log、frontend-build.log、final-typecheck.json、final-static-audit.json、graph-review-*.json。

## Linux

Validate regression job 保留全部旧 gates，增加官方 managed CPython provisioning → mandatory offline environment tests → full fresh browser。独立 real-python-runtime job 继续 Phase 6 install/verify/remove。当前宿主 Darwin arm64，没有本阶段 Linux 实机 run 结果；**Linux PARTIAL**，未 push/dispatch，不能用 macOS 替代。

## Retained test fixture

`prepare-managed-runtime` 只创建独有临时目录并记录 result.json，便于同一次 gate 复用源码编译成果。生产没有开关导入宿主解释器。重复开发过程中只对本阶段 disposable v4 fixture 重建过草稿 DB，没有改动 frozen v3 或任何用户数据库；refresh-fixture-schema.cjs 拒绝含未清理 Environment 的 fixture。测试结束通过生产资源删除保护清理 interpreter，并清理唯一 owned fixture。
