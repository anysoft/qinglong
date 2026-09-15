# Operational Schema v3

平台 v2 冻结自 Phase 5 checkpoint 21e733fe / platform-phase5：back/schema/platform-v2.json 与 platformV2.ts。禁止从最新 ORM 重建 v2 fixture。

v2 model signature：968fdebb6e9029c5d826f1acc2db02e8b1b1c8d16615533e2ba6975daf20fa72。
v2 schema signature：92abfeca0aa4531abc65bb51171db0620d8ee2c3b4d161f0f2e531896525264f。

先核对版本、冻结模型与实际 SQLite schema signature，再事务创建 RuntimeProviders/RuntimeInstallations/RuntimeOperations 及约束/index，最后更新 PlatformMetadata CHECK(3) 与最新签名。任何 DDL/数据/签名失败均 rollback，不清库。

Fresh 用同一 runtimeSchema SQL 建表。已有合法 v1 先使用冻结 v2 DDL 完成原 Hook/Config 迁移并验证中间 v2，再同事务 v2→v3；不会使用最新 ORM 冒充 v2。未知、篡改签名、未来版本 fail closed。

FK 全部 RESTRICT；Provider language/type 唯一；Installation provider+implementation+version 唯一；Operation log identity 唯一；SQL CHECK 限制 language/provider/implementation/state/optype/status/cancel_requested，避免 SQLite Sequelize ENUM 仅应用层校验。

测试比较 fresh/migrated 最终 schema、FK/check，保留有效 ENV/Config/Hook 数据；早期/晚期失败与重试；原 v1 链测试继续执行。
