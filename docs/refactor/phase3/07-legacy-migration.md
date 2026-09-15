# 显式迁移与回退

1. 旧 URL 订阅先使用 Phase 1 的“转换为 Repository”操作。私有订阅先选择可复用凭证；不自动提取 URL 中的秘密。
2. 选择仓库、凭证覆盖、分支和原过滤规则，保存为 Legacy 也可以。
3. 点击“检查已保存配置的 Managed 就绪状态”：会访问远端并准备持久工作区，但不切模式。
4. 在编辑界面选择 Managed 保存。服务端重新预检，通过后才保存绑定与模式。失败时旧记录仍可运行。
5. 手动运行，检查阶段日志、最近结果、commit、scripts 文件和 Task。定时运行使用相同内部入口。
6. 如需回退，在编辑界面选 Legacy 或 PUT git-mode；无需删除 bare / Worktree。原 Legacy 下次仍执行 rm-rf + clone + 原 copy / Task 流程。

API（以默认 `/api` 前缀为例）：

| 操作 | 接口 |
| --- | --- |
| 创建/保存模式 | POST / PUT `/subscriptions`，可选 git_mode |
| 预检已保存配置 | POST `/subscriptions/:id/managed/preflight`，空 JSON |
| 显式切换 | PUT `/subscriptions/:id/git-mode`，`{"git_mode":"MANAGED"}` 或 LEGACY |
| 运行/停止 | 复用 PUT `/subscriptions/run`、`/subscriptions/stop` |
| 查看状态 | 复用 GET `/subscriptions`、`/subscriptions/:id`、日志接口 |

仍通过既有 API 鉴权和资源权限链。客户端不能传入 local_path、worktree_id 或同步结果。切换模式不触发任务运行，禁用订阅不删除任何 Git 数据。

首次部署前使用原备份机制保留数据库及 scripts；迁移是 additive，但旧版本删除已被订阅引用的工作区不懂新引用保护，因此回退运行模式应优先于回退服务版本。没有实现 Backup v2。
