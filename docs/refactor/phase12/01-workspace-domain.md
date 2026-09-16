# Workspace domain

Workspace 身份就是已登记的 Worktree ID；不新增 Workspace 表或 schema 版本，当前仍为 v9。`CodeWorkspaceService` 组合 `WorktreeService`、`RepositoryPathResolver`、`GitCommandService` 与 `WorkspaceFiles`。路径由 Repository/Worktree ID 推导，并验证 bare registration、双向 .git/admin 指针及数据库 local_path。

产品入口为 Code Workspace，Repository → Worktrees → Open Workspace。源码与 TaskSource、Discovery、Execution、Backup 指向同一份 Worktree。编辑器不生成执行副本、不接受任意主机根目录，不调用 Runner、不解析 command 建 Task。

Git author identity 作为显式平台设置保存于既有 Auth JSON 存储，type=workspaceGitIdentity，仅 name/email，不混用登录名或宿主 global Git config。没有数据库迁移。
