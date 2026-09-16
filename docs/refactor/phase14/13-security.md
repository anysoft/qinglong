# Security boundaries

本地快照包含数据库秘密和原文件明文，要求当前 UID、0700 目录/0600 文件、no-follow 与 nlink 检查；恢复原始用户文件 mode。Portable 必須口令认证加密，header/length/tag/密文任一损坏失败关闭，认证前不提取。

路径来自服务器 UUID 和 relative inventory；拒绝 traversal、absolute link、symlink ancestor escape、hardlink、special file、超限 entry/size/depth、未来/未知 schema、Config mismatch、Git corruption、manifest/file/mode tamper。

删除/候选清理依赖 owner+dev+ino；restore journal 的路径必须匹配当前 control resolver。quarantine/candidate inode 替换不能继续 rename。坏 journal 不允许普通启动跳过。

Panel endpoints 沿用面板认证，Open API 不开放备份和恢复。公开 DTO、UI、操作 JSON、CLI 不输出 Secret、passphrase、绝对敏感路径。仅 encrypted export 可下载。旧 tar 上传/下载返回 410；`ql reload data` 在停服务/改文件之前拒绝。

本实现不是针对已掌控同 UID 进程/内存的攻击者的沙箱；校验和也不是本地密钥签名。持有操作系统写权限的外部编辑者必须遵守平台锁，否则无法承诺事务一致性。

Git 验证以复制后的 bare/admin 目录为边界，拒绝 include/includeIf、外部 filter/diff driver、core.worktree 等配置。候选 repair 重建其自己的 registration 后才调用 Git，不能沿源 `.git` 的绝对路径修改原工作区。便携导入/导出即使在路径校验或目录分配阶段失败，也清零所持有的口令 Buffer；JavaScript 输入字符串依赖运行时回收，不能声称其可确定擦除。

SQLite integrity_check 的结果与外键校验相互独立；外键违规查询只取首条即拒绝，避免恶意违规记录形成无界返回数组。Run/Config 历史按 500 行读取，文件与日志内容按流复制/校验。
