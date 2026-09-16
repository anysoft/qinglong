# Filesystem — 当前布局与后续目标

> **当前基线：Phase14 + Phase12 / schema v9。** Code Workspace 直接消费 Worktree，与 Execution/GitSync 复用 EX lease，与 Backup 复用平台 mutation barrier。当前结构见 [Code Workspace](19-code-workspace.md) 与 [Backup/Restore](18-backup-restore.md)；下列早期阶段段落为历史记录。后续顺序 Phase16A → Phase15 → Phase16B。

> Phase 10 当前执行架构：Schema v7、TaskRuns / TaskRunAttempts、Worktree direct execution、immutable Context 与 Runner v2 已生效。下面保留的旧阶段描述不再定义正常执行路径。参见 [Execution Engine](14-execution-engine.md) 与 [当前桥接状态](../../TEMPORARY_BRIDGES.md#phase-10--execution-engine)。

> **当前基线：Phase 8，schema v5。** Runtime Core 同时支持 Python 与 Node；Node 新增 exact PackageManagerToolchain、NodeEnvironment、不可变 Revision/Build，独立 node_modules 与共享 store。下文早期阶段描述保留为演进记录；当前结构见 [Node Runtime 架构](12-node-runtime-environments.md)，最新约束以该文档和 [Phase 8 schema](../refactor/phase8/10-schema-evolution.md) 为准。Task/Hook 仍使用现有 Runner Bridge，未实现 Phase 9/10 绑定。

下列为后续目标，尚未统一重命名：

```text
data/
├── db/
├── git/
├── worktrees/
├── runtime/          # Phase 6 implemented
├── config-assets/    # Phase 5 implemented
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

## Phase 5

新增 `data/config-assets/asset-ID/revisions/N/content` 与 `data/tmp/config-materialization/<workspace-key>/run-UUID/`。ENV/Hook 私有计划沿用 `.tmp/task-env/run-*`。稳定 `.locks/config-<key>.lock` 协调共享执行工作区；publication lease 继续保护发布目录。旧用户 hook 文件不再创建或读取，但不会自动删除已有用户文件。

## Phase 6

新增 platform-owned runtime/python/pyenv、cache/runtime/python/downloads、tmp/runtime/python、log/runtime，以及 .locks/runtime-provider-ID.lock。Provider code、versions、ownership 分开；Repair 隔离区不自动删除。文件系统与删除规则见 [Runtime filesystem](../refactor/phase6/06-runtime-filesystem.md)。未新增 scripts/deps/dep_cache 消费者；现有 Backup bridge 不承诺完整包含这些资源。

## Phase 7 Python environments

- `runtime/python/environments/env-ID/builds/build-ID/venv`：独立不可变 generation，固定路径不搬移。
- `runtime/python/environments/env-ID/metadata/build-ID.json`：ownership sidecar；环境根 sidecar 在父目录。
- `cache/python/pip`：共享可重建下载缓存，不是 site-packages。
- `.locks/python-environment-ID.lock` / `.locks/python-build-ID.lock`：稳定 inode 互斥/共享 pin。
- 操作 tmp/log 沿用 Runtime 目录。未被 DB 登记的内容仅报告，不接管或自动删除。
