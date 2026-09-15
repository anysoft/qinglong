# Installation / Verify / Remove / Repair

1. 校验 exact CPython stable version 存在于缓存 Catalog。
2. 获得 Provider 独占跨进程锁；事务写 Runtime INSTALLING、Operation QUEUED。
3. 隔离 HOME/TMPDIR，检查工具/可用空间，验证 Provider，排他创建安装根与外置 ownership sidecar。
4. python-build 编译精确版本，直接执行绝对解释器 -I -S 固定 JSON diagnostic。
5. 比较 CPython、exact version、sys.executable、prefix、base_prefix 的 realpath；保存 executable SHA256、sys.version、OS/arch、逻辑字节数、Provider revision、build timestamp，提交 READY。

后续 Verify 先比较执行文件 hash，再执行 diagnostic；不会改写构建时 Provider revision/timestamp。磁盘用量在显式 Verify/Install 后刷新，限 250000 entries，不跟随 symlink，不在页面轮询时递归扫描。

Remove 在锁内两次检查引用，确认目录 identity/ownership 后删除，再确认缺失。失败保留记录与外置 sidecar，部分 rm 可重试。Repair 明确将旧根与 ownership 副本移入隔离区，然后重新安装；失败不会自动抹去隔离数据。未知/未标记目录不接管、不删除。

verify 不做任意 Python console；ensurepip 可能作为 CPython 标准安装的一部分存在，但平台不安装任何共享第三方包。
