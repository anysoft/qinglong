# Phase 5 验证证据

最终证据：platform-tests.log、backend-build.log、frontend-build.log、final-typecheck.json/log、final-static-audit.json、platform-e2e.json/log、browser-*.png、linux-availability.json、final-review-HEAD/develop.json。最终状态由根目录 PHASE5_REPORT.md 汇总。

其余 *tests.log、impact、index、format 文件为开发中的定向验证与审计记录，可能包含后来修正的夹具/浏览器选择器失败；不能替代最终发布门禁。所有浏览器私钥、数据库和 Secret 值都来自隔离临时 fixture，运行结束清理。没有对真实用户 DATA_DIR 执行迁移或清理。

GitNexus MCP 未提供，本任务使用 Node 22 的 GitNexus CLI；UNKNOWN/lower-bound 结果不代表没有消费者。最终 detect-changes 在复制的 Git index 内纳入新文件，不改用户真实暂存区；HEAD 对比用于 Phase 5，develop 对比保留全分支回归范围。

Git helper 调查最终定位为 Darwin zombie-only group 的 killpg EPERM；git-helper-timeout-stress.log 为修复前可复现错误，process-group-stress.py/log 为同路径800次短超时复验，process-group-tests.log 为确定性边界与既有锁回归。更早两个带临时诊断的全量通过和6000次普通压力未能覆盖此竞态，只作调查历史；平台最终结果以 platform-tests.log 为准。临时 traceback 已移除，生产使用不泄露命令/ENV的安全 process_group helper。
