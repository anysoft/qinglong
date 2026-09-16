# Task Source

正式类型 WORKTREE_ENTRYPOINT：worktree_id、relative_entrypoint、language、cwd_mode、cwd_relative_path。Repository 经 Worktree 定位，不复制 URL、branch 或绝对路径。

支持 PYTHON、JAVASCRIPT、TYPESCRIPT、SHELL。cwd 为 WORKTREE_ROOT、ENTRYPOINT_DIR、CUSTOM_RELATIVE。相对路径拒绝绝对路径、Windows drive/backslash、空段、`.`、`..`、控制字符及 NUL。深度校验逐段 lstat，拒绝根与父目录 symlink，入口必须 regular file；FIFO、socket、目录均拒绝。文件选择器只列允许扩展名的普通文件。

Manual Task 可直接选现有 Worktree，无需 Subscription。发现 Task 的 Worktree/entrypoint 归发现器管理，用户不能偷偷换源。跨 Repository 换源在事务内重新校验完整资源关系。

B01 仍需已发布的 subscription namespace。TaskExecutionSourceBridge 将逻辑来源转换为临时命令；未发布来源明确返回 CURRENT_BRIDGE_SOURCE_NOT_PUBLISHED。绝不回写 staging path 到 TaskSource。Worktree direct execution 属于 Phase 10。
