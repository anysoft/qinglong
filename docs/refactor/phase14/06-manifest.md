# Immutable manifest

manifest v1 记录 backup_id、created_at、mode、application_version、source_os/source_arch、platform_schema_version、included/excluded components、runtime materialization policy、SQLite hash/size、inventory hash/size、domain counts、Git repository/worktree HEAD、文件数与字节数。

所有还原路径由相对 inventory 和数据库资源 ID 计算。源绝对路径即使存在于被备份的 Git/DB 内容中，也不作为路径解析真相。manifest 不复制 ENV、Credential、Channel/Webhook/Config secret 或 passphrase。

本地 READY checksum 防意外篡改；便携文件的完整 manifest/inventory 受 AES-GCM 认证。不能把无密钥 SHA256 当作抵抗同 UID 攻击者的认证签名。

公开 API 使用白名单 projection，既不返回文件内容也不暴露内部路径。Validate 重算每个文件、SQLite、Config revision 和 Git 完整性，拒绝新增/缺失/改 mode 文件。schema 校验对照冻结 v1–v9 identities；更高版本 RESTORE_BACKUP_TOO_NEW，未知 schema fail closed。

application_version 从应用 version.yaml 读取并限制为版本字符串；测试夹具缺失版本文件时标记 unknown。inventory 的 file_count 包含文件、目录和符号链接；total_bytes 只统计常规文件内容，数据库单独快照后计入总量。
