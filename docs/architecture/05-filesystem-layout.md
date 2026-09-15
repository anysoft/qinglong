# Filesystem Target

```text
data/
├── db/
├── git/
├── worktrees/
├── runtime/          # future
├── config-assets/    # future
├── logs/
├── cache/
├── tmp/
├── locks/
├── uploads/
└── backups/
```

集中PlatformPaths拥有路径构造/规范化/realpath边界；资源ID决定路径，branch/alias/name不参与磁盘身份。cache只存可重建内容；Worktree dirty files和未推送对象是用户数据。Secret临时目录独立owner，结束清理，崩溃回收必须确认所有者退出。锁文件稳定，不删除正在持有的inode。

4.5B不一次改名所有目录：repo/raw在来源退场后去创建逻辑；scripts/deps/dep_cache/config/.locks/log仍按临时桥保留。root/scripts构建工具不属于data/scripts。Backup必须将DB、唯一工作区内容和Git对象/refs成对保存；现有export不等于该契约。

完整现状与每目录gate见[文件系统计划](../refactor/phase4.5/08-filesystem-cleanup-plan.md)。
