# Encrypted portable export/import

只从已验证 READY 快照 export。复用 PLATARC1 流式归档和 PLATBKP1 envelope；scrypt N=32768/r=8/p=1/maxmem=64 MiB，AES-256-GCM，salt 16 bytes、nonce 12、tag 16，固定 header 参与 AAD。未认证成功绝不解包。

明文 archive 和密文生成于私有 staging。完整写入/fsync 后才 rename 到 exports；下载只接受服务器 UUID，不提供 local snapshot 下载。失败无可下载的 partial artifact。

API body/multipart 中的口令只留在请求/operation 内存；Buffer 在 finally 清零，JSON operation/manifest/log 不记录。CLI 仅 stdin 或私有 passphrase file，禁止口令 argv。UI export 二次确认，完成/关闭清空表单。

Import 上传至私有隔离目录 → authenticate/decrypt → 安全解包 → manifest/inventory/DB/Git/Config 校验 → VALIDATED。此时 DATA_DIR 没有被修改。格式不是旧 tar，未提供 legacy format migration。
