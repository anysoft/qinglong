# Git 获取路径与删除边界

## 全部获取类别与真实链

| 类别 | 入口 → 服务 → 命令 → 文件系统 | 结论 |
| --- | --- | --- |
| Legacy manual URL | API subscriptions/run 或 handleTask timer → formatUrl/formatCommand → ScheduleService.runTask → ql/update.sh repo → update_repo → git_clone_scripts → rm -rf + git clone --depth=1 → data/repo/uniq → data/scripts | REMOVE 4.5B |
| Repository-backed Legacy | 同调度 → repositorySubscriptionCommand → back/gitSubscription.ts → SubscriptionGitResolver + private credential → bash update.sh repo → 同旧 clone | REMOVE 此分支；helper 的 Managed 分支还活跃 |
| Managed Subscription | API/定时 → ID helper → ManagedSubscriptionService.run → storage.initialize/fetch → Worktree.ensure/withSync FF → managed_discovery → scripts/Cron publish | KEEP 核心，拆掉兼容部件 |
| 显式 workspace UI/API | workspace.ts → RepositoryStorageService / WorktreeService → GitCommandService + supervised argv → git init --bare / fetch / worktree add/remove / merge --ff-only | KEEP |
| Access test | gitResources → credentials/repository testAccess → credential resolver → git ls-remote | KEEP；只读探测不是 clone |
| Optional bot | Docker/native 启动条件 → ql bot → shell/bot.sh → git_clone_scripts → repo/dockerbot 或 diybot → jbot 复制+requirements | REMOVE 产品功能及启动分支后才可删 clone helper |
| Build source acquisition | docker/Dockerfile* → git clone QL_URL 到 QL_DIR | 构建平台源码，包含SOURCE_COMMIT fetch/reset；CI另clone qinglong-static；不是订阅。DEFER 镜像供应链清理，不能混删 |
| Platform updater | SystemService update/reload → ql update/reload → download zip / reload helpers | REPLACE 发行流程；不是 repository fetch |

源码未发现订阅 `git pull`；持久更新使用 fetch + FF merge，旧更新使用 rm + clone。完整命中见 diagnostics/phase4.5/git-paths.json；gitProvider 的 repoPath 是 URL pathname，不是 data/repo。

## 可以删与不能整文件删

- 删除目标：formatUrl 的 URL 密码/SSH alias 逻辑、旧 raw/clone 分支、convert API、Legacy/Managed mode selector、legacy preflight 迁移入口、URL/private credential 表单、旧启动路径改写。
- `back/services/subscriptionGit.ts` 不能整文件直接删：Managed.prepare 仍调用 resolver，它无条件执行 validateLegacyGitArguments；stage 仍调用 legacyCheckoutName。先把 Repository-only context 从旧 adapter 中拆出。
- `back/gitSubscription.ts` 是实际 ID CLI dispatch，Managed 仍依赖；保留内部 ID helper，删除 Legacy else 分支。
- `shell/update.sh` 不能整文件删：managed_discovery 以 QL_DISCOVERY_LIBRARY_ONLY=1 source 并复用 diff_scripts/gen_list_repo/diff_cron/add_cron/del_cron；还有 ql rmlog/reload/check/reset 等职责。
- `git_clone_scripts` 还有 bot caller；不把 bot 当 dead code。4.5B 关闭 bot 产品入口后一起删，不能遗留启动时报错。
- 旧 URL 名称函数同时决定新 Managed scripts prefix；先换 ID-based publication namespace（如 subscription-ID）并在新库测试多订阅隔离，再删 collision warning 与 remote spelling 兼容限制。

## data/repo 所有剩余引用

back/config/index.ts repoPath；SubscriptionService.removeUnlocked 的 alias 强删；shell/share.sh dir_repo、ql_static_repo、fix_config；shell/update.sh update_repo；shell/bot.sh 两个 checkout。update.sh scanner 的局部 repo_path 是通用输入目录，Managed 传 Worktree，不等于还依赖 data/repo。测试/历史 docs 的旧路径证据可归档而不是当生产 caller。

目标 `/repo`=REMOVE in 4.5B，前置为旧 Subscription 与 bot 路径退场。禁止把 repoPath 重定向到 git/worktrees 或执行全 data 清理。保留 Repository ownership markers、realpath/symlink guards、FF-only、本地提交保护、恢复状态、POSIX 锁/lease。
