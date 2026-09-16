# Optimistic concurrency

读取 H1，保存必须发送 expected_hash=H1。在获得 Worktree EX lease 后核验当前 bytes SHA256；不一致返回 WORKSPACE_FILE_CONFLICT。发布临时文件前再次核验，失败清理仅本次 UUID 临时文件。

Create 要求 must_not_exist=true，并在文件系统层排他发布。Delete/Rename 携带文件 hash 或目录 identity；目标已存在返回 WORKSPACE_DESTINATION_EXISTS。不存在 last-write-wins 或 Overwrite Anyway。

浏览器冲突弹窗：Reload 丢弃本地草稿并重新读取；Cancel 保留草稿，不修改磁盘。多标签缓冲仅在内存中，关闭标签/离开页面/切换 Worktree 时确认未保存更改；不自动写 localStorage。浏览器崩溃会丢失尚未保存的草稿。

此机制防止平台会话与已发生的外部修改相互覆盖。POSIX 普通 rename 不提供对不合作恶意外部写进程的通用文件内容 CAS；不把 advisory lock 描述为 OS 隔离。
