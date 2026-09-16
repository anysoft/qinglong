# Runtime Filesystem Ownership

| DATA_DIR 相对路径 | Owner / 性质 | 删除规则 |
|---|---|---|
| runtime/python/pyenv/.runtime-owner.json | Provider 标记 | 不自动重建非空未知根 |
| runtime/python/pyenv/providers/REV | pinned Provider code | 显式 Repair 隔离 |
| runtime/python/pyenv/versions/EXACT | 安装解释器 | Runtime Remove，锁 + 引用 + ownership |
| runtime/python/pyenv/ownership/runtime-ID.json | 外置 identity/dev/ino sidecar | 完成 Remove 后删除 |
| runtime/python/quarantine/operation-ID | Repair 保存的旧数据 | 人工核对后处理，未做自动留存删除 |
| cache/runtime/python/downloads | 可重建下载缓存 | 不属于 Runtime identity |
| tmp/runtime/python/operation-ID | 私有 HOME/build/temp | 所属操作结束时清理，未知状态保留 |
| log/runtime/runtime-operation-ID.log | 操作 ID 日志 | 有界日志，当前无自动历史清除 |
| .locks/runtime-provider-ID.lock | 稳定锁 inode | 不删除活跃锁 |

RuntimePathResolver 逐层 lstat 拒绝 symlink/特殊文件/非当前 UID 目录；拒绝 absolute/../NUL/backslash。DATA_DIR 先验证本身不是 symlink，再 canonical realpath（兼容 macOS /var 别名）。版本根不允许 symlink；bin/python 可以是指向同一安装内部普通可执行文件的链接。

owned root 的 dev/ino 必须吻合 sidecar。复制数据到另一机器可能改变 inode，且二进制依赖 OS/arch；不承诺目录可移植或自动 adopt。DB 外发现的版本只报告 orphan。

不读写 scripts/deps/dep_cache，不修改 shell profile、系统或 Backend Python。受信任平台 UID 本身能更改数据，因此边界不宣称防御同 UID 持续竞争替换；数据根应独占、0700。

创建安装根与发布外置 sidecar 之间若恰好断电/磁盘写满，根可能留为未登记目录；该窗口 fail closed，需要人工核对，不会冒充可删除 owned 安装。一般中断（sidecar 已发布）可直接 Verify/Repair/Remove。
