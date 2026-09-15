# Platform Schema v2

v1 来自提交 `9a9ad297` 的真实 Operational Schema。`back/schema/platform-v1.json` 与编译可用的 platformV1.ts 保存原始对象/签名；不从 v2 ORM 反推或修改 v1 定义。

非空数据库必须有唯一 PlatformMetadata、符合已知版本与 model/schema 签名，且 foreign_key_check 清洁。v1 路径严格核对冻结的原始签名；IMMEDIATE 事务中新建五张表、转存旧 Hook、移除旧字段、写 v2 metadata，最后再次 FK 检查。v2 SQL 签名对引号外空白规范化，保留字面值；Fresh v2 与迁移 v2 签名相同。

新增 ConfigAssets、ConfigAssetRevisions、RepositoryConfigBindings、TaskConfigBindings、TaskHooks。删除 Crontabs.task_before/task_after 与 Subscriptions.sub_before/sub_after。Task 子资源 CASCADE；资产与 Repository 引用 RESTRICT。

旧 task_before → BEFORE/CONTINUE；旧 task_after → FINALLY/CONTINUE，保留原命令，符合 v1 旧失败非致命和普通失败后仍执行 after 的语义。旧隐式语言/preload ENV 回传不兼容，需改显式 Hook Output Protocol。Subscription Hook 无现行产品职责，字段删除，未引入新的 Subscription 生命周期。

事务内早期建表失败和后期 DROP COLUMN 后失败均须回滚；未知/QingLong/检查点库拒绝，不自动清空、不猜测迁移。v1→v2 是新平台自身版本演进。
