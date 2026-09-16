# Phase 14 — 基础模块契约

本文件记录底层文件、归档、加密、SQLite 与锁契约。Continuation 的生产接入见 03–14，最终实测结果以 PHASE14_REPORT.md 为准。

## Portable envelope / passphrase

`back/services/backup/envelope.ts` 使用 Node crypto 的 scrypt（N=32768,r=8,p=1；32-byte key）
与 AES-256-GCM。固定 64-byte header：magic PLATBKP1、版本/KDF/cipher 标识、固定参数、
16-byte random salt、12-byte random nonce、保留位。整个 header 作为 AAD，末尾 16-byte tag。
不接受输入选择任意 KDF 成本。版本 1 拒绝尾随数据、截断、header/ciphertext/tag 篡改。

输入/输出为 operator 内部路径；输出 wx、0600、父目录 0700。解密到私有不透明临时文件，
只有认证成功返回后才能调用解包。失败删除本调用创建的文件，既有 destination 不覆盖。
key Buffer finally 清零；调用者负责清零 passphrase Buffer，不保存、不记录、不返回。
CLI/UI 口令入口已由 BackupCoordinator 接入；HTTPS 终止属于部署配置，不由归档模块提供。

## Archive

PLATARC1 是版本化 framing（不是自创加密）：4-byte JSON 长度、严格字段的 entry header、
file bytes、32-byte SHA256；0-length header 表示结束。无压缩、无 hardlink 类型，所以没有
压缩膨胀通道。长度头最多 16KiB、路径最多 4096 bytes、默认最多 100万 entries、单文件
128GiB、总文件数据 1TiB。每块最多 64KiB，按实际读取字节计数，不预分配 entry.size。

路径拒绝绝对/Windows drive/backslash/NUL/控制字符/空段/点段。仅普通文件、目录和安全
相对 symlink。拒绝所有源 hardlink（比只拒绝越界更保守）和特殊文件；目标逐级无 symlink，
独占创建，拒绝 duplicate。链接按实际路径分量解释，防止 `link/../outside` 逃逸。
结束后第二次有界遍历检查后创建的链接目标，不在内存积累百万个链接。

解包目标必须新建私有空目录；失败留下的候选目录只能由拥有它的 operation 清理，
绝不把此函数指向 live DATA_DIR。输出保持私有 mode；原始 executable/file mode 由独立 inventory 保存，由 RestoreService 在候选校验后恢复。

## SQLite

snapshotDatabase 使用 VACUUM INTO；目标必须不存在，snapshot 自包含，完成后对副本运行
integrity_check / foreign_key_check 并 fsync。实际 WAL 测试保留源连接，快照后再写源，
删除源后验证副本仍可读且不包含后写数据。无 cp SQLite，无外部 WAL/SHM 依赖。

该函数本身不协调平台写入；调用者必须先持有跨资源屏障。BackupValidator 校验冻结 schema identities，RestoreService 在候选中调用正式迁移链。

## Barrier

PlatformBackupBarrier 复用 RuntimeLease / runtime_lease.py 的真实 FD flock。
controlRoot 必须由 BackupPaths 路径层校验并位于可切换 DATA_DIR 外。
backup.lock 排他操作；mutation.lock shared 持续覆盖业务动作；snapshot 获取 exclusive 后
再次验证 idle。状态文件 QUIESCING → SNAPSHOTTING，失败/超时释放，默认 10 分钟。
已有队列使用 drain=true 可排空；新的 producer mutation 默认拒绝。RESTORE_PENDING
状态不得被 abandoned snapshot recovery 清除。

独立进程 SIGKILL 测试确认状态 fail closed、FD 释放、显式启动恢复后才重新放行。
Task/Trigger/Git/Discovery/Runtime/Config/notification/API 已接入；具体调用点见 04-quiesce-barrier.md。
需要为后台长操作及继承 FD 的子进程覆盖整个最后写入生命周期，HTTP response 结束不是资源 idle 的证明。

## 生产集成

BackupCoordinator / BackupOperations / BackupValidator、RestoreService / RuntimeRestoreReconciler / RestoreRebuildService 复用这些基础模块。完整组件、manifest、七点 crash matrix、规模测试、Panel/CLI 与异地恢复证据见后续文档及最终报告。
