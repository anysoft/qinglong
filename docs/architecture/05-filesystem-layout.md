# Filesystem — 当前布局与后续目标

下列为后续目标，尚未统一重命名：

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

4.5B不一次改名所有目录：repo/raw 的创建逻辑已删除；scripts/deps/dep_cache/config/.locks/log仍按临时桥保留。root/scripts构建工具不属于data/scripts。Backup必须将DB、唯一工作区内容和Git对象/refs成对保存；现有export不等于该契约。

完整现状与每目录gate见[文件系统计划](../refactor/phase4.5/08-filesystem-cleanup-plan.md)。

## Phase 4.5B 当前 Fresh Layout

`db/`、`git/`、`worktrees/`、`.locks/`、`tmp/` 与 `scripts/`、`config/`、`deps/`、`dep_cache/`、`log/`、`syslog/`、`bak/`、`upload/`。Backend bootstrap 使用 0700 并拒绝 symlink；执行 snapshot 另有 owner 管理的私有 `.tmp/task-env/`。Git 凭据上下文独立创建/清理。

未创建 repo/raw，未批量删除既有目录。编译脚本只清理 compiler-owned static/build，避免删除源文件后旧编译模块继续进入安装包。
