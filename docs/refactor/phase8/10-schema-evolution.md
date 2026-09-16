# Schema v4 → v5

Phase 7 checkpoint: 33564c77；真实 previous version 为 v4。platform-v4.json/platformV4.ts 冻结旧签名，不修改 v1/v2/v3。

v4 model signature: f87ccaa6e53e9a975ca25c8215dddd418900ac8c24370799f33cd3860efc973d
v4 schema signature: bed6850a372e4e208f56326de92dd784cb78ef009689519215706cb850a96f09

v5 扩展三个 Generic Runtime 表的 CHECK，新增 Toolchains/Environments/Revisions/Builds 四表，共 30 个模型。复合 FK 确保 Toolchain/Runtime 一致、Build/Revision/Current 同 Environment；RESTRICT 引用，immutable triggers，重复 dependency JSON 校验。

在 IMMEDIATE transaction 中创建替代表、复制行、替换表并重建索引，保留既有 Python rows/IDs/refs。整个迁移失败回滚。Fresh 安装调用同一最新 DDL，签名与迁移一致。

SQLite drop/recreate 父表会保留过期 deferred FK counter。保持 foreign_keys=ON，迁移最终必须 foreign_key_check 为空，才在提交前 defer_foreign_keys=OFF 清除该计数；绝不通过 foreign_keys=OFF 跳过约束。真实 Python 引用迁移、晚期注入故障回滚、Fresh 相等及损坏签名拒绝均已测试。

参考：[SQLite 关于 deferred foreign key counter 的说明](https://sqlite.org/forum/info/64fb781a226df95c0f4edc474e590214c28ae1b4b5ddeee8f7ec4ad77286796c)。
