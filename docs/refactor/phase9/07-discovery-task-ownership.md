# Discovery Task Ownership

现有 Discovery plan 经 B07 传入 TaskService.reconcileDiscoveredTasks。新文件创建 Task + Source + RuntimeBinding + Settings，再发布调度投影。Source 使用结构化 relative path 和 Subscription Worktree，禁止从 command 反向恢复身份。

现有 plan 对用户修改的 name/schedule 做所有权判断；协调层只更新发现所有的字段。Runtime、ENV、Config、Hooks、参数及 Settings 留在 Task domain，不被发现覆盖。删除定义延后到 staging 发布和调度接受之后；失败恢复原定义、投影与发布文件。

克隆变为 MANUAL，不再受 Subscription 清理管理。B07 沿用已有发现流程，Task Discovery v2 在 Phase 11。

删除 Subscription：有发现 Task 时普通删除返回 SUBSCRIPTION_TASK_REFERENCED，且不会提前取消调度。显式关联删除通过 Task 调度事务删除发现定义和 Subscription；调度失败回滚定义、Hook 与订阅，保留手工 Task、Repository、Worktree 和日志。
