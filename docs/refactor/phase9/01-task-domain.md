# Task Domain

`Tasks` 是定义的唯一事实来源，`TaskService` 负责 CRUD、乐观版本、克隆和发现所有权。`TaskSources`、`TaskRuntimeBindings`、`TaskExecutionSettings` 使用 task_id 一对一关联。ENV、Config、Hooks 保留独立编辑 API，所属 FK 改为 Tasks。

MANUAL 无订阅身份；DISCOVERED 以 subscription_id + discovery_key 标识。名字不参与身份。核心编辑必须携带 expected_version，冲突返回 TASK_EDIT_CONFLICT。删除级联定义子资源，保留执行统计、RunningInstances 与日志。

克隆产生禁用的 MANUAL Task，不复制发现身份；复制参数、设置及 Task 资源。订阅继承的 Runtime/Profile 转成显式绑定，Repository 默认仍可继承。Secret 在数据库内部复制，不通过 API 回传。
