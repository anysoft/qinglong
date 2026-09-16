# Path security

Panel 只传 Worktree ID 与相对路径。拒绝绝对路径、Windows drive/UNC、反斜线、空段、`.`、`..`、NUL/control、超过4096字节路径；逐段 lstat 拒绝 symlink ancestor。`.git` 大小写变体与执行/编辑原子临时名不可访问。

符号链接只展示自身 metadata；安全相对目标可展示，绝对或越界目标返回 UNSAFE_SYMLINK 并省略目标字符串。禁止通过链接读取、编辑、删除和重命名目标。普通读取用 O_NOFOLLOW/O_NONBLOCK，FIFO/socket/device 与多 hardlink 普通文件拒绝。根目录不能重命名或删除。

不按 tmp/cache/venv/node_modules 名字拒绝用户源码。活跃执行占用期间，第一版保守拒绝整个 Workspace 的文件/Git读取；占用结束但 Config/Node binding journal 尚存时返回 WORKSPACE_RECOVERY_REQUIRED，交由正式 Execution recovery 恢复，避免访问材料化 Secret。

Worktree 之外的 Config/ENV/Credential/Notification 存储不在文件 API 的根内。平台不是同 UID 恶意进程的 OS sandbox；外部文件系统写入者应遵守平台锁。
