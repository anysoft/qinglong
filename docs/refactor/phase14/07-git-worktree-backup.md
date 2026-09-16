# Git and worktree preservation

备份整个本地 bare object database、refs、reflog、worktree index/HEAD 和用户文件，不 clone 远端，不按 `.gitignore` 排除。可达 local-only branch/commit/tag、tracked dirty、untracked、ignored、原 mode 和安全 symlink 均在 inventory 中。

BackupRestoreGitRepairService 是唯一备份域 Git adapter：固定参数、禁 hooks/fsmonitor、无 shell、限制输出/超时，执行 fsck 和 HEAD 检查。外部 alternates 拒绝，避免生成依赖源机器对象库的伪完整备份。

Restore 按 Repository/Worktree ID 得到新 bare/worktree 路径，通过 `git worktree repair` 修复 registration；先 candidate 验证，再在最终 DATA_DIR 重做 repair。更新 DB storage_path/local_path，执行 fsck/status/rev-parse。禁止把旧根字符串替换成新根。

灾备测试应删除源目录并让 origin 不可用；普通跨目录复制测试不足以证明离线恢复。

Git 配置安全：拒绝 includes、外部 filter/diff driver、额外 core.worktree 和 worktree-config；status 忽略 submodule execution。校验/修复不应因为导入的 Git 配置而运行任意命令。需要这些配置的仓库先人工评估，不能静默移除配置后宣称完整恢复。

在 candidate 中先验证 admin registration/commondir 位于对应 bare，再按 ID 路径重建 `.git` 与 admin/gitdir，然后调用 Git repair。这样 repair 从一开始就只指向候选根，不把导入的源绝对路径交给写操作。保留这些元数据文件原 mode，最终发布后同样重建并复核。
