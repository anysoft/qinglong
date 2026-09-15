# Step 0 filesystem baseline

Source-derived layout (no user data scanned):

# Filesystem Cleanup / Ownership

路径来自 config/index.ts、share.sh、workspacePaths.ts、initFile.ts、Docker/native，未扫描真实用户数据。

| 当前路径 | Action | Owner / 目标 | 删除前置 |
| --- | --- | --- | --- |
| data/db | KEEP | SQLite domain + auth cache | version bootstrap；不删除已有库 |
| data/repo | REMOVE | 被 git/worktrees 替代的 clone；还有 bot | 旧 source+bot 停用、引用零；仅 fresh 布局移除 |
| data/raw | REMOVE | 旧 file subscription | URL/raw API/UI/CLI 删除 |
| data/scripts | FUTURE REPLACE / TEMPORARY_BRIDGE | staging+手工源码+editor+生成文件混合 | 9–12 消费者全部替换；不可视为 cache |
| data/config | FUTURE REPLACE | settings/credentials/hooks/generated 混合 | 5 Config Assets；内部证书/token 拆出，不能整目录删 |
| data/log | RENAME（后续） | logs/tasks 与 logs/subscriptions | 10/13 run identity/reader/retention |
| data/syslog | RENAME（后续） | logs/system | logger、ql log、health、PM2 同改 |
| data/deps | TEMPORARY_BRIDGE | 用户共享辅助文件/包路径 | 6–8/11；不是 pip cache |
| data/dep_cache | TEMPORARY_BRIDGE | pnpm global + Python prefix + downloads | Runtime 替换；安装本体不得按缓存清空 |
| data/ssh.d | REMOVE legacy 部分 | SshKeyService 持久 key/config | 旧 Git 与 global SSH 设置退场；不碰任意 HOME/.ssh |
| data/bak 与 config/bak | FUTURE REPLACE | 备份/编辑文件恢复 | 14 Backup；存在独有数据 |
| data/upload | KEEP / RENAME 提案 | 头像/上传 | settings 外部资源路径更新后再迁 |
| data/git | KEEP | 有本地唯一 objects/refs 时不是可丢 cache | ID ownership/双向 Git 指针保持 |
| data/worktrees | KEEP | 用户代码工作区 | dirty/untracked/local commits+lease 保护 |
| data/.locks | KEEP，未来可 RENAME locks | POSIX 稳定锁文件 | 必须停全部 owners 再切根，不能 unlink 正持有的锁 |
| QL_DIR/.tmp | FUTURE REPLACE | updates/node cache/task-env/recovery | 分 owner 迁到 data/tmp 或 data/cache |
| shell/preload/env.* | REMOVE after replacement | Global 生成代码 | ENV gate 全绿 |
| /tmp/env_PID.json | REMOVE after hooks replacement | before env 回传 | 5 统一 hooks bridge，非直接 glob 清除 |
| HOME/bin/{ql,task} | TEMPORARY_BRIDGE | 任务与运维可执行入口 | 10/部署入口切换 |

目标布局：

```text
data/
  db/
  git/
  worktrees/
  runtime/          # Phase 6–8
  config-assets/    # Phase 5
  logs/             # task-runs / sync-runs / system
  cache/            # 可重建下载/索引，不放唯一源码或安装定义
  tmp/              # 每操作随机目录，owner/权限/清理
  locks/            # 稳定锁文件
  uploads/          # 仍需用户上传，不能为图简洁丢功能
  backups/          # Phase 14 恢复材料
```

4.5B 只移除已经退场的 repo/raw/旧 SSH 默认创建，隔离 scripts/deps；不把所有目录按目标图立即改名。源码根 `scripts/` 是 build-info/benchmark 工具，与运行数据 `data/scripts/` 完全不同，禁止混删。

Backup/exportData 当前默认 db/upload 加所选目录并使用 data/ 字面路径，不能保证自定义数据根、活跃 SQLite 和 workspace/git 成对一致性。新的 fresh-only 平台仍需保护本地 commits/dirty files；fresh-only 不等于所有运行数据都是可丢缓存。4.5B 不实现 Backup v2。
