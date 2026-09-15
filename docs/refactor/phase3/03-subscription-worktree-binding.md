# 订阅与工作区绑定

- 同 Repository、同 branch 复用 Phase 2 的唯一 `branch_key` 工作区；不同分支使用不同工作区，共享 bare 对象。
- 预检可以初始化、fetch、ensure，但不切换订阅模式、不复制脚本、不创建 Task。
- 保存 Managed 配置或启用 Managed 时，再在 Repository + Worktree 锁内检查并落库绑定，防止检查后工作区被删除。
- 更改仓库或分支会清除旧绑定并预检新绑定；不会 checkout、reset 或删除旧工作区。保存失败保留旧订阅配置。
- 空 branch 使用当前默认分支。已绑定订阅发现默认分支对应工作区发生变化时报告 `WORKTREE_BINDING_CHANGED`，需要显式重新保存绑定；不会悄悄挪动原工作区。
- 切回 Legacy 保留绑定、bare、Worktree 和任务。删除订阅释放引用但保留 Git 对象与工作区。Managed 的强制删除只沿用显式删除关联 Task 的语义，不按 alias 删除 scripts 或工作区。
- `purpose` 表示创建用途，`subscriptions` 表示当前引用。共享引用有一个未释放时，Delete / Remove Record 都失败为 WORKTREE_IN_USE。

Phase 3 没有 Task.worktree_id，Task 不获取执行租约；仍在 scripts 中运行。
