# Phase 14 — Data Classification

状态：实施前审计；本文件不表示 Backup / Restore 已通过验收。

## 权威路径

`back/config/index.ts`：`QL_DATA_DIR`，默认 `QL_DIR/data`；SQLite 为
`db/database.sqlite`。目录名不是数据可删除的依据。所有排除只作用于新生成的备份，
绝不删除源目录。工作区外 `.tmp/task-env` 与短路径 Unix socket 亦需检查活动所有者。

| 数据 | 分类 | FULL_PORTABLE 策略 |
|---|---|---|
| SQLite 全部 operational 表、Auths/账号、Credential、ENV Secret、通知 Secret | A UNIQUE | quiesce 后 VACUUM INTO；完整保留，integrity/FK 验证 |
| Task/Source/绑定/Settings/Hooks/Triggers/Discovery 与成功水位 | A UNIQUE | 数据库完整保留；不从命令或派生文件重建 |
| Run/Attempt/Event/Health/incident/Outbox/Delivery 与去重身份 | A UNIQUE | 默认完整保留；SENT/DEAD 不重置 |
| `git/<host>/repository-ID.git` | A UNIQUE | 整个对象库、refs、reflogs、不可达对象；离线 fsck，不依赖远端 |
| `worktrees/repository-ID/wt-ID` | A UNIQUE | HEAD/index、修改、untracked、ignored、用户 node_modules；保留 mode 和安全相对链接 |
| `config-assets/asset-ID/revisions/N/content` | A UNIQUE | 所有 revision（含不再引用的内容），保留 checksum；Secret 同样保护 |
| `log/task-runs`、`log/runtime`、订阅/历史日志 | A UNIQUE / D CONDITIONAL | 默认包含；历史缺失仅记录，声称存在却缺失明确警告 |
| Runtime exact version/provider revision、环境 Desired/Revision/Build resolved/lockfile/toolchain 选择 | A UNIQUE | 保留数据库定义；物理材料缺失必须不可用，显式重建 |
| `runtime/python/pyenv/providers`、`versions`；Python 环境 venv | B REBUILDABLE | 排除物理安装；不能排除或删除对应数据库历史 |
| `runtime/node/versions`、`package-managers`、环境 Build/node_modules | B REBUILDABLE | 排除物理安装；保留锁文件和解析历史 |
| `cache/runtime`、`cache/python/pip`、`cache/node` | B REBUILDABLE | 排除已知平台缓存；不按文件名排除工作区内容 |
| Runtime ownership sidecar / dev / ino / executable 验证材料 | C EPHEMERAL | 不恢复旧 inode 所有权；重建由正式服务建立新 ownership |
| `.locks`、PID、Unix socket、执行临时目录、私有 HOME、Hook 输出 | C EPHEMERAL | 不重新激活；快照前证明 idle |
| `tmp/config-materialization`、Node binding recovery journal | C EPHEMERAL（含暂存 UNIQUE 用户原件） | 未完成时必须恢复或失败；不能直接忽略 journal 和原件 |
| Runtime quarantine / 未识别 runtime 文件 | D CONDITIONAL | 不自动删；无法证明仅可重建时拒绝并报告需审计 |
| `config`、`scripts`、`deps`、`dep_cache`、`bak`、`upload`、未知根目录 | D CONDITIONAL | 保守保留可能唯一的用户内容；特殊文件/不安全链接失败关闭 |
| `syslog` | D CONDITIONAL | 平台仍持续写入；须单独协调日志写入或明确排除为运维诊断，不冒充一致用户 Run 日志 |
| 项目根 diagnostics、源码构建产物、开发测试夹具 | B / 非 DATA_DIR | 不纳入生产备份 |

## 安全与恢复约束

Local Snapshot 是敏感明文，目录 0700、文件 0600；可执行 mode 单独记录，恢复时还原。
Portable Export 必须 scrypt + AES-256-GCM，敏感 manifest 在加密载荷中；认证成功前禁止解包。
绝对/越界 symlink、特殊文件、无法证明边界的 hardlink 失败关闭。工作区安全相对链接不能
穿过其他 symlink 逃逸。平台临时 node_modules binding 必须已清理。

BACKUP_DIR 与 DATA_DIR 独立、禁止相互包含；inventory 从 manifest/sidecar 重建，不依赖待恢复 DB。
Restore 仅离线/启动前应用；不同 DATA_DIR 通过 ID resolver + git worktree repair 修复，
不能替换字符串猜路径。所有 Runtime 缺失后必须显式重建，不使用系统解释器。

## B16 历史入口审计（现已关闭）

`SystemService.exportData` 用 shell tar 打包 db/upload 和选中目录，未做 SQLite snapshot、
停写、Git/Config/Run 一致性或加密。`importData` 解包任意旧 tar；`reloadSystem('data')`
交给旧 CLI 应用。这不是当前平台完整备份，continuation 已关闭这些旧入口；新验收证据以最终 Phase 14 报告为准。
未在这些入口发现独立 Backup Schedule；本阶段不新增备份调度器。

## Continuation B16 边界

System 的完整 tar 导出/上传实现删除，旧 route 返回 410，Shell data reload 在停服务/修改文件前拒绝。`api/script` 的编辑前单文件 `data/bak` 副本仍承担局部数据保护，不是平台备份产品；本阶段保留且由默认 `other-user-data` 分类纳入完整快照。它的编辑器替代属于 Phase 12，不以 Backup 清理为由删除用户副本。
