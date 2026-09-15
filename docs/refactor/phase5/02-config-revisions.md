# 不可变 Revision

存储为 `data/config-assets/asset-ID/revisions/N/content`，目录 0700，canonical 内容 0400。名称、目标路径和文件扩展名不参与存储路径。

保存持有 SQLite IMMEDIATE 事务，检查 expected_version，独占创建 revision 目录，临时文件写入、fsync、原子 rename、目录 fsync 后插入 revision 并切换 DB 指针。失败回滚指针，仅清理此次明确创建的目录。既有 revision 永不覆盖。进程崩溃留下的未提交目录保留，后续保存跳过已占用编号，因此编号可能不连续。

运行开始时固定 revision_id、checksum、binding；后续编辑不影响本次运行。内容读取核对 ID 路径、regular file、O_NOFOLLOW、大小与校验和。运行副本与 canonical 分离，允许写的副本也不会回写资产。

TEXT 内容包括空字符串；拒绝非法 Unicode、NUL 路径、超限字节。API 的 metadata-only 保存不生成新 revision；Secret 采用 Keep Existing 或 Replace，禁止降级为非 Secret。
