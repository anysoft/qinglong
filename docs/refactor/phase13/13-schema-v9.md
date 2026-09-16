# Schema v8 → v9

platform-v8.json / platformV8.ts 在任何生产编辑前从 de01f425 的真实模型/SQLite冻结。model signature: 76a163a1db237f866c831e7deb1cea881ffd5b99045ccaeaef6c9d244ac3bbb4；schema signature: 0b5518b2ebc83fa8bcd53b9c298cb7e2a3cd487f2ba8bd67a2681ce7ee319899。旧v1..v7文件未变。

v8验证通过后同事务添加TaskRuns日志metadata、Attempts result/retry列，新增TaskRunEvents、TaskHealthStates、NotificationChannels、TaskNotificationPolicies、TaskNotificationChannelBindings、NotificationOutbox、NotificationDeliveries及索引/触发器。最后更新metadata至9。新表为SQL-owned，不另建ORM重复来源。

旧Task/Run/Attempt/Trigger/Event不drop/recreate。Health使用SQL聚合回填，按finished_at/id计算last/consecutive，不把全历史装进JS内存。不伪造旧Event/Attempt细节。旧通知Auths导入default Channel；各Task旧enum映射保持行为。

fresh走相同DDL；有效v1..v7先通过原冻结版本迁移至真实v8，再执行v9。实际fresh和migrated schema signature相同；晚期DDL故障可回滚重试、FK clean。未知签名fail closed，不接管旧青龙库。
