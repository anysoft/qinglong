# Legacy Compatibility Contract

> Phase 0 历史快照：本文记录重构前基线。当前代码已新增 GitCredential / Repository、可空订阅引用及兼容适配器；现状增量、测试和限制见 [Phase 1 报告](../../PHASE1_REPORT.md)。旧执行管线保持基线行为。

每个后续Phase必须声明保持/迁移/有意改变的条目。不能用“统一Runner”隐含抹平差异。

| ID | 必须保留或显式迁移的行为 | 保护 / 验证 |
|---|---|---|
| L01 | Crontabs现有id、command、schedule、extra/once/boot、启禁/置顶/labels | schema-migrations、cron-validation、scheduler系列 |
| L02 | 手工与Node定时/系统cron入口、重启恢复、调度失败回滚 | manual-execution、scheduler-reconciliation/readiness/mutation；system crond补集成 |
| L03 | Subscription legacy ql repo/raw参数、flags、筛选及辅助文件复制 | Phase0 formatCommand + real clone/scanner；raw待补 |
| L04 | 不把当前会删除repo的行为传播到用户持久Worktree | Phase0 dirty tests明确legacy行为，迁移前备份 |
| L05 | 自动与手工同Crontab模型，sub_id归属和删除差异保留 | Phase0 SQLite models + scanner API payload；真实HTTP贯通待补 |
| L06 | enabled ENV合并顺序、A&B、disabled生成过滤、conc/desi编号 | Phase0 generator；invalid name/whitespace/template已记录 |
| L07 | JS/Python preload、QLAPI、before文件、PYTHONPATH/NODE_PATH解析 | Phase0实际task.sh三语言；ESM/TS/package解析已有或待补 |
| L08 | Task task_before/after、global before/after、subscription hooks语义 | 03流程；不得无声把after改成success-only |
| L09 | work_dir、日志覆盖、默认scripts子目录cwd、`--`参数 | task/log tests；补custom cwd和参数矩阵 |
| L10 | 状态idle不等于成功；RunningInstances真实exit_code和stats | process-exit-state、task-time、Phase0 SQLite exit7 |
| L11 | stop/queue token竞态、允许多实例、进程树清理 | manual-stop-claim、stop-race、scheduler系列 |
| L12 | 日志旧路径可读、offset/chunk、结束标志、SockJS消息 | logReader/log-path-security/execution-lifecycle；不能只保留新日志 |
| L13 | 通知脚本API与Backend配置、重复任务/订阅增删通知 | wpush-grpc；真实provider使用fake服务补集成 |
| L14 | /api和/open认证/资源scope、旧接口410、Joi错误结构 | auth/http/user/file-routes/front-http测试 |
| L15 | DB自动迁移和回滚备份、无隐式FK级联删除历史 | schema-migrations、dashboard-failures、retention |
| L16 | Dependency共享global安装、已有dep_cache恢复 | dependence-cache-status、system-dependence-cache；隔离runtime为显式迁移 |
| L17 | QL_DIR/QL_DATA_DIR/HOME及Alpine/Debian/native差异 | 源码清单、Node22主机验证；容器矩阵待补 |

已知bug不是永久产品承诺：R02注入、R05路径偏差等应单独安全修复，更新测试期望并提供迁移说明。characterization测试表达“现在是什么”，不代表批准继续保留缺陷。
