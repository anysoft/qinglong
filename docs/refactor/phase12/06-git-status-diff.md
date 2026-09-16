# Git status / diff

所有 Git 操作复用 GitCommandService 和私有 CredentialResolver。固定 argv、无 shell；global --literal-pathspecs 与 `-- paths` 避免前导减号、通配符、空格、分号、美元符号成为参数或命令。

Status 使用 porcelain v1 -z；现有 parser 识别 index/worktree 两列、untracked/conflicted 与 rename extra token，公开 changed_files 分页。5000变更不会一次返回给 UI。界面显示 staged/unstaged/untracked、HEAD、branch、upstream、ahead/behind。

Diff 支持 working 和 staged，关闭 external diff/textconv/submodule执行。Git helper 有界收集256 KiB，响应最多4000行，明确 truncated；二进制返回 changed 标记。默认其他 Git 操作仍保留原有4 MiB fail-closed限制。

Workspace 拒绝含 include/filter/diff/worktree配置等危险本地 Git 配置；hooks和fsmonitor禁用。不会通过内容 diff 启动任意外部程序。错误不返回 raw stderr 或宿主绝对路径。
