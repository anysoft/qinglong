> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Task ENV Overrides

Task 继续使用 Crontabs。Repository 身份只来自 `Crontab.sub_id → Subscription.repository_id`。自动发现不复制变量或 Profile ID；下次运行读取最新继承关系。Managed 与 Legacy 订阅都可继承，Git 模式不参与 ENV 选择。

无 Repository 的手工任务或 URL/File 订阅任务仅支持 Global + Task Overrides。Profile 选择显示 Unavailable；后端同样拒绝跨仓库/无仓库绑定，不能绕过 UI。

Task 编辑器提供 Environment 区域；独立环境页 Task tab 可选择任务。变量编辑和绑定是独立的即时保存操作，不依赖任务主表单的保存。清空 Profile 选择即恢复继承。

| 操作 | 结果 |
| --- | --- |
| enabled + SET | 设置原始字符串，覆盖低优先级 |
| enabled + UNSET | 删除前面来源中的变量，包括宿主 |
| disabled | 整行不参与；不是 UNSET |
| SET + 空字符串 | 变量存在且值为空；不是删除 |
| clear=true | 删除这一条 override，下次运行恢复低优先级来源 |

同 Task 内变量名唯一。批量编辑在一个事务中完成，任意非法条目导致全部回滚。没有新增乐观版本检查；并发提交使用 SQLite 原事务串行化，最后提交者获胜，不会发生半批写入。

删除 Task 时其变量由 FK 级联清理，不删除 Repository Profile；正在执行的实例已经拥有独立快照。没有改变 RunningInstances schema 或旧 Task 停止/删除进程语义。
