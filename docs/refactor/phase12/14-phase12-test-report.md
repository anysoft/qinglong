# Phase 12 test report

本文件与根目录 PHASE12_REPORT.md、diagnostics/phase12/final-gates.json 一起记录最终验收。开发中日志不代表最终PASS。

正式新增测试位于 tests/phase12，并纳入 tests/platform/test-baseline.json：路径/文件类型/UTF8与EOL/BOM/mode/原子失败/冲突/文件操作；真实Git/Push/状态与diff/规模；独立进程Worktree与平台屏障；正式Discovery身份。

浏览器 harness 使用真正fresh应用、SQLite、Chrome、SSH上传/接收端、正式Task运行和Backup/Restore；无HTTP mock，不使用宿主语言解释器冒充managed Runtime。规模用例为20k文件lazy tree、10k文本搜索预算、5k Git变更分页、10MiB diff限制。

运行顺序：完成 backend build 和 frontend build 后再启动 tests/app；backend build会删除重建static/build，不能与正在运行的应用或测试并行。

```sh
node scripts/build-back.cjs
./node_modules/.bin/max build
node tests/platform/run.cjs
node diagnostics/phase12/check-typecheck.cjs
node diagnostics/phase12/browser-e2e.cjs
```

Darwin证据不替代Linux资格验证；Linux留给Phase15。本阶段不新增CI、Docker或发布流程。

## 最终正式回归

- Platform：458 tests，455 passed，0 failed，3既有Darwin skips；未减少原438项覆盖。
- Managed venv/npm/pnpm环境与生命周期：3/3 PASS。真实Runner Python/CJS/ESM/tsx：2/2 PASS。
- Backend与Frontend build PASS。Typecheck regression PASS（0新增，22历史；raw exit 2）。
- Browser、静态审查、GitNexus与测试资源清理的完整结果见根报告及 final-gates.json。
- 曾有一次旧Cron规模测试临时目录清理ENOTEMPTY，日志单独保留；最终全量重跑通过，无旧测试断言修改。
