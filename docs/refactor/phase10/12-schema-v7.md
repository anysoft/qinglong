# Phase 10 — Schema v7

platform-v6.json / platformV6.ts 从当前 Phase 9 实际模型与 SQLite schema 冻结，不反推简化 schema。

- v6 model signature: `36a056d575aef79247d83fe099cc71e50e41c60bad5bf0df47e3a476c0cf94ec`
- v6 schema signature: `9926ba6337ccfa0b49d564ffb7813268b0df6ca9a181debb469a327c1302d8a6`

升级先验证 v6 完整签名，在同一事务内建立 TaskRuns、TaskRunAttempts、索引、CHECK/trigger guards，最后更新 metadata 到 7。晚期 DDL 注入失败必须回滚全部变更，重试可成功；已有 Config Secret、Runtime/Environment/Task 定义保持。

fresh v7 和真实 v6→v7 的规范 schema 签名必须一致。历史 v5→v6 分支先写冻结 v6 metadata，再通过同一 v7 gate，不能用新模型签名冒充旧 schema。测试覆盖 tamper、外键、唯一尝试号、状态守卫和活跃资源删除保护。
