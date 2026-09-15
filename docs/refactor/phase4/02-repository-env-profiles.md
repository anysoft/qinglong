# Repository Environment Profiles

`RepositoryEnvProfileService` 提供 create/update/detail/list/clone/remove。一个 Repository 可以有 prod/test/多个账号 Profile；名字在同仓库内唯一，跨仓库可以重复。Profile 的 repository_id 不可编辑。

默认 Profile 通过 Repository.default_env_profile_id 表示。设置新默认替换旧默认；清除默认只清除指向目标 Profile 的绑定。Task/Subscription 显式选择仍优先。

Profile detail/list 返回 name、description、status、is_default、variables_count、used_by（直接 Subscription/Task 引用和默认引用）。没有读取运行时环境或返回 Secret。列表用一条带索引计数的查询；变量另行分页能力尚未提供。

Clone 在一个事务中复制全部变量，Secret 在后台内部复制，不经过浏览器。默认状态不会随 clone 复制为新的 Repository 默认。Secret metadata 编辑不会清空原值。

删除保护：默认、Subscription、Task 任一引用存在即 ENV_PROFILE_IN_USE。禁用不删除也不回退；执行选中了 disabled Profile 则 ENV_PROFILE_DISABLED。删除 Repository 前在原删除事务里检查 Profile，然后才允许文件系统清理；DELETING 仓库拒绝新 Profile，关闭检查后新增引用的窗口。

仓库管理入口链接到环境页；仓库工作区的 Environment tab 展示 Profiles、Default、Usage，并链接到当前仓库的管理页。Global 管理页原功能保留。
