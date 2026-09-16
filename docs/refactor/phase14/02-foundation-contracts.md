# Phase 14 — 已实现基础模块与待接入契约

本文件区分单独可验证的模块与尚未提供的产品能力。当前不是可用的完整备份产品。

## Portable envelope / passphrase

`back/services/backup/envelope.ts` 使用 Node crypto 的 scrypt（N=32768,r=8,p=1；32-byte key）
与 AES-256-GCM。固定 64-byte header：magic PLATBKP1、版本/KDF/cipher 标识、固定参数、
16-byte random salt、12-byte random nonce、保留位。整个 header 作为 AAD，末尾 16-byte tag。
不接受输入选择任意 KDF 成本。版本 1 拒绝尾随数据、截断、header/ciphertext/tag 篡改。

输入/输出为 operator 内部路径；输出 wx、0600、父目录 0700。解密到私有不透明临时文件，
只有认证成功返回后才能调用解包。失败删除本调用创建的文件，既有 destination 不覆盖。
key Buffer finally 清零；调用者负责清零 passphrase Buffer，不保存、不记录、不返回。
目前没有 CLI/UI 口令入口；不能声称已经验证端到端口令生命周期或 HTTPS 配置。

## Archive

PLATARC1 是版本化 framing（不是自创加密）：4-byte JSON 长度、严格字段的 entry header、
file bytes、32-byte SHA256；0-length header 表示结束。无压缩、无 hardlink 类型，所以没有
压缩膨胀通道。长度头最多 16KiB、路径最多 4096 bytes、默认最多 100万 entries、单文件
128GiB、总文件数据 1TiB。每块最多 64KiB，按实际读取字节计数，不预分配 entry.size。

路径拒绝绝对/Windows drive/backslash/NUL/控制字符/空段/点段。仅普通文件、目录和安全
相对 symlink。拒绝所有源 hardlink（比只拒绝越界更保守）和特殊文件；目标逐级无 symlink，
独占创建，拒绝 duplicate。链接按实际路径分量解释，防止 `link/../outside` 逃逸。
结束后第二次有界遍历检查后创建的链接目标，不在内存积累百万个链接。

解包目标必须新建私有空目录；失败留下的候选目录只能由未来拥有它的 operation 清理，
绝不把此函数指向 live DATA_DIR。输出保持私有 mode；原始 executable/file mode 的
manifest 保存及最终恢复尚未实现，不能把当前 archive roundtrip 宣称为完整 Worktree 恢复。

## SQLite

snapshotDatabase 使用 VACUUM INTO；目标必须不存在，snapshot 自包含，完成后对副本运行
integrity_check / foreign_key_check 并 fsync。实际 WAL 测试保留源连接，快照后再写源，
删除源后验证副本仍可读且不包含后写数据。无 cp SQLite，无外部 WAL/SHM 依赖。

该函数本身不协调平台写入；调用者必须先持有跨资源屏障。平台 schema 签名/迁移验证未接入。

## Barrier

PlatformBackupBarrier 复用 RuntimeLease / runtime_lease.py 的真实 FD flock。
controlRoot 必须由未来 operator 路径层校验并位于可切换 DATA_DIR 外。
backup.lock 排他操作；mutation.lock shared 持续覆盖业务动作；snapshot 获取 exclusive 后
再次验证 idle。状态文件 QUIESCING → SNAPSHOTTING，失败/超时释放，默认 10 分钟。
已有队列使用 drain=true 可排空；新的 producer mutation 默认拒绝。RESTORE_PENDING
预留状态不得被 abandoned snapshot recovery 清除。

独立进程 SIGKILL 测试确认状态 fail closed、FD 释放、显式启动恢复后才重新放行。
**尚未接入 Task/Trigger/Git/Discovery/Runtime/Config/notification/API，因此不能称平台屏障已生效。**
需要为后台长操作及继承 FD 的子进程覆盖整个最后写入生命周期，HTTP response 结束不是资源 idle 的证明。

## 必须继续的实现顺序

1. 完成全部数据路径审计；为未知 runtime/quarantine、syslog、journal 制定可执行策略。
2. operator BACKUP_DIR / control root 所有权与 containment、稳定 backend lifetime lease。
3. 各 mutation 入口 impact → service admission → worker/子进程生命周期接入；idle gate 包含 recovery journals。
4. snapshot inventory / immutable manifest / hashes / fsync / READY atomic publication、Git/Config/log 校验。
5. restore candidate / schema chain / Git repair / Runtime reconciliation 与可执行 rebuild plan。
6. 版本化 checksum journal，启动 DB bootstrap 前 apply，old/candidate 切换与 rollback，保留 pre-restore。
7. Panel API、Backup & Restore UI、offline CLI 与 pending/cancel/explicit rebuild。
8. 完整 crash matrix、100k Runs、真实跨根灾难恢复、浏览器 secret audit、正式 Runtime 重建。
9. 替代 gate 通过后移除 B16；最终报告及 Linux Phase15 待验项。
