# Config Asset 领域

ConfigAsset 是独立于 Git、ENV、源码和平台 Settings 的用户资源。名称仅用于展示；磁盘身份只由数据库 ID 与 revision number 构造。编辑资产不会提交 Git，也不会修改 Worktree。

`ConfigAssets` 存名称、描述、类型、Secret 标志、current_revision_id、version 与时间；`ConfigAssetRevisions` 存 asset_id、revision_number、SHA-256、字节数、storage_key 和创建时间。外键使用 RESTRICT，先解除引用才能删除资产。Phase 5 不提供任意 revision 删除；删除资产后保留未引用存储，未来由显式 Backup/GC 策略处理。

正式支持 UTF-8 TEXT，最大 1 MiB；模型类型保留扩展边界，BINARY API 明确返回 `CONFIG_BINARY_NOT_SUPPORTED`。Secret 内容仍以明文存磁盘，严格权限保护；未实现静态加密。
