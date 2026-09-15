# Schema v4

Phase 6 checkpoint `1eafedc7` 的实际 v3 frozen fixture：`back/schema/platform-v3.json`、`platformV3.ts`。

- model signature：`c83d072e7f1bbff93669dfa1114ac6ad8b0cd4bd0b5a9c61256b6432ba263204`
- schema signature：`52f0f56ac70877e35d69af0c104e3ac38e4fd3a3cc3819976ad89e3c58cd55b1`

保持 v1/v2 fixture 原样；v1→冻结 v2→冻结 v3→v4，同一 IMMEDIATE transaction。每个 previous signature 先验证，foreign_key_check 必须为空。新鲜安装也先使用固定 Runtime v3 DDL，再执行相同 v4 增量，最终 schema signature 与升级路径一致。

v4 新增 PythonEnvironments/Revisions/Builds；RuntimeOperations 扩展六个环境操作类型，其余历史记录不丢失。创建新 operation table、复制、替换与索引重建均在事务内。运行时 FK RESTRICT，Revision/Build 的复合 FK 保证环境/运行时一致；Current Build/Revision 复合 FK 保证属于同一环境。Revision 和已发布 Build 有实际 SQLite immutability triggers。

schema 测试覆盖旧 Runtime/history 保留、fresh==migrated、晚期触发器 DDL 故障完整回滚再试、篡改 fail-closed、Current 跨环境拒绝和 Runtime 删除保护。已有 v1/v2 演化测试继续运行。
