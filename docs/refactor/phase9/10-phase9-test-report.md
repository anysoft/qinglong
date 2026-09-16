# Phase 9 验证记录

最终状态与计数以根目录 PHASE9_REPORT.md 和 diagnostics/phase9 下最终日志为准。测试覆盖 schema、source 安全、Task domain、resource references、发现补偿、当前 scheduler/runner 与真实浏览器。

当前回归测试夹具已切到 Task 表：旧 projection fixture 显式创建 canonical Task，仅供旧执行桥测试。历史 archived tests 不参与发布 gate，也不改写其记录。固定 schema manifest 不按测试失败重新生成。

Browser 使用真实后端、SQLite、SSH Git server、Worktree、当前 Runner。官方 Python/Node artifacts 经前置实际准备后复制到隔离测试安装目录，Python venv/pip 和 Node npm 安装实际执行。没有 HTTP mock，不把当前 host interpreter 的运行声称为新 Environment 实际 Task 执行。

继承 Phase 8 类型检查预算：53 项历史错误，新增必须为 0。Linux workflow 未执行则保持 PARTIAL，不能用 macOS 代替 Ubuntu 证据。

## 最终本地回归

- 平台：366 total / 363 passed / 0 failed / 3 skipped。跳过为 macOS 上的 node-path-cache 锁测试，Linux CI 仍须运行。
- 真实 managed venv/pip/npm/pnpm 与生命周期：3 passed / 0 failed。
- Backend / Frontend Build：PASS。
- TypeScript：34 existing / 0 new，回归预算 PASS。
- 静态审计：350 production files / 0 forbidden or unclassified，73 个广义桥接命中已解释。
- 1000 Task：24 次批量查询（API 状态另加 1 次）。
- Browser / Fresh 以最终 platform-e2e.json 为准。

最终 Browser/Fresh：PASS，22 个流程步骤；687 个响应、23 个 WebSocket 帧未发现测试 Secret 泄漏。另有 browser-restart-editor.json / .png 记录实际重启后重新打开编辑器的字段持久化。测试夹具正式清理 PASS；总体因 Linux CI pending 与既有 TypeScript 债务保持 PARTIAL。
