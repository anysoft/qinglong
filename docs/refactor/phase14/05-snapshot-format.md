# Snapshot format v1

```
BACKUP_DIR/
  snapshots/<uuid>/
    .owner.json
    manifest.json
    inventory.ndjson
    data/db/database.sqlite
    data/git/...
    data/worktrees/...
    data/config-assets/...
    data/log/...
    data/<other preserved files>
    READY
  .staging/<uuid>/...
  exports/<uuid>
  imports/<uuid>/snapshot/...
  operations/<uuid>
```

DATA_DIR、BACKUP_DIR、control 必须互不包含且不能相等。拒绝 symlink 根和非私有目标目录。快照目录 0700、文件 0600；原始 POSIX mode 存 inventory，candidate 验证完成后恢复用户模式。READY 保存 manifest 的 SHA256。

清单为逐行 JSON：path、kind、mode、size、sha256/link。文件流复制，最大文件 128 GiB，总量 1 TiB，100 万 entries，深度 128，清单行 16 KiB；校验路径集合另有 64 MiB UTF-8 path bytes 上限。超限失败，不截断数据。

相对安全软链接存链接本身；绝对/越界链接、hardlink、FIFO/socket/device 一律失败。归档不压缩，无解压炸弹路径。
