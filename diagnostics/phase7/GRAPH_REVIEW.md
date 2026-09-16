# Phase 7 graph review

GitNexus impact 在既有符号修改前执行，记录见 baseline/lease/new-services/verify-final/resolver-final impacts。初始新增符号 UNKNOWN 是索引尚未登记，不能当成无调用；实际 API/model imports、Runtime executor 和测试补查后，最终索引已包含新模块。

警告已向用户报告：getProvider HIGH、operation CRITICAL；最后 Verify HIGH，直接调用方 PythonEnvironmentBuildService.execute，向上覆盖 RuntimeOperation 请求/执行；Resolver LOW 但存在动态 receiver 边界。

当前全量 detect_changes（相对 HEAD，即 Phase 6 checkpoint）与相对 develop（Phase 5 + Phase 6/7 累积）都为 **CRITICAL**，最终计数：HEAD 566 symbols / 30 flows；develop 累计 1132 symbols / 66 flows。精确列表见 graph-review-HEAD.json / graph-review-develop.json。包含全部 changed_symbols 和 affected_processes，不只 CLI 的 15/10 条摘要。

## 工具输出限制

GitNexus 1.6.12 把 changed_symbols 输出数组硬限制为 1000，相对 develop 的累计变更首次触发 truncated=true；原始证据保留为 graph-review-develop-original-capped.json。诊断脚本 graph-review-full.cjs 使用临时 sibling module，仅将输出清单上限提升到 10000，分析逻辑、风险计算和安装的工具文件均未修改，临时文件最终删除。来源 SHA/参数记录见 graph-output-cap.json。补跑结果没有输出截断或查询 partial。

索引本身仍受流程采样预算限制：861 candidate entry points dropped、864 callees dropped、36 bounded walks、4 depth-capped traces（index-final.log）。因此图结果是有边界的辅助证据，不能声称全代码路径已被图穷尽。人工复核关注：Schema migration、Current publish transaction、Runtime reference defaults、共享 Build FD、取消/恢复分派、路径/所有权和 Task/Config 未改动边界。真实离线、浏览器、完整 release tests 补充动态证据。

未提交 Phase 7、未 push/deploy。Phase 6 checkpoint 已在执行 detect_changes 后提交。
