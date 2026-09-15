# API / UI Consolidation

完整逐路由声明清单：[API inventory](../../../diagnostics/phase4.5/api-inventory.md)。覆盖 back/api 全 19 文件；循环路由显式展开；挂载/鉴权来自 api/index.ts 与 loaders/express.ts。标记是清理计划，不表示路由已删除。

## API 分类原则

- NEW PLATFORM CORE：Credential、Repository、Worktree、Scoped ENV、health/security/metrics 等能力；目标单一 versioned platform API（提案 `/api/v1`，4.5B 不必全量改前缀）。
- LEGACY ONLY：subscriptions convert/git-mode、URL/private-pull fields、crons/import、deprecated 410 filename endpoints；去掉 mode 后 preflight 保留 prepare 能力并改名。
- INTERNAL-ONLY：crons/status、dashboard/record、系统 internal notify 与 token 生成链。现在可能也向 App 开放，目标是收紧；标签不是对当前权限的描述。
- DUPLICATE：`DELETE /repositories/:id` 同时定义于 workspace.ts 与 gitResources.ts；api/index 先注册 workspace，前者已响应，后者在该入口被遮蔽。保留 storage deletion 唯一实现；不能据此删整 RepositoryService。
- REPLACE/TEMPORARY：旧 ENV/API、Crontab Task/instances、Dependencies、Scripts、Configs、backup、ql-backed system update/reload；有活跃 UI/运行消费者，不按“旧 API”一次删除。
- `/update/*` 不能全称 dead：Settings restore 调用 update/data；它与 system/reload 的责任有重叠，先统一运维服务契约。

## Shell → HTTP → Backend 回环清单

| Caller | Endpoint | 当前消费者/目标 |
| --- | --- | --- |
| update.sh add/del | /open/crons | Legacy 删除后退场；Managed 已拦截成 JSONL 并直接 publishSubscription |
| share.handle_task_start/end → api.sh update_cron | /open/crons/status | 当前 Task run 实例与 exit code；必须保留直到结果 IPC |
| api.sh record_cron_stat | /open/dashboard/record | 统计；由 TaskRun 完成事件派生，取消重复客户端报数 |
| api.sh notify_api | /open/system/notify | Legacy scanner/CLI；Managed 已后端通知，脚本 SDK 另行处理 |
| api.sh find_cron_api | /open/crons/detail | 旧日志/名称查询桥；source identity 后替换 |
| api.sh update_auth_config | /open/system/auth/reset | ql reset 子命令；新的安全管理员恢复入口后删除 |
| get_token → token.ts / initTask | system App + config/token.json | status/stat/notify 当前必需，不是没有对外 API 兼容就可删 |

Backend 内部一律可转 Domain Service direct call；独立 Shell 进程不能直接调用进程内 TypeDI Service，须用受限 IPC/Runner controller 协议。4.5B 可以移除外部旧 API 承诺，但不得关闭仍用于内部状态上报的 `/open` rewrite 后声称执行正常。JS/Python client.* 主要经 Node gRPC 客户端，不是每个 QLAPI 都走 HTTP；protobuf/gRPC 服务也不能顺带删。

## Frontend inventory / IA

| 当前页面/组件 | 分类 | 4.5B / 后续目标 |
| --- | --- | --- |
| subscription/modal Legacy/Managed、Manual URL、convert、pull credentials | REMOVE | 必选 Repository，保留 ref/filter/prepare/ENV/schedule |
| subscription/index 最近 sync/worktree 状态 | KEEP/MERGE | Repositories→Subscriptions；去 mode badge |
| env/index 原 Global | MERGE/REPLACE | Environment Global 唯一 key/Secret；去 &/排序语义 |
| scoped-env + scoped-environment + repository-environment | KEEP/MERGE | 一个 Environment 入口，Profile/Task 管理复用 |
| repository/index + repository-workspace | KEEP | Repositories/Credentials + Workspace 子资源；保留状态/lease/repair |
| crontab 页面/modal/views/log/instances | FUTURE REPLACE | 当前 Tasks bridge 留；9/10 改 Task/Schedule/Run |
| script 页面/editModal | TEMPORARY_BRIDGE | 12 转 Code Editor→Workspace；不是删页面后就没有依赖 |
| config 页面 | FUTURE REPLACE | 5 Config Assets + Hooks；先留旧文件编辑能力 |
| dependence 页面/setting mirrors | TEMPORARY_BRIDGE | 6–8 Runtime；禁止新功能继续绑定 global prefix |
| log/dashboard | KEEP/REPLACE identity | 10/13 TaskRun 日志与指标 |
| setting auth/notification/IP/retention | KEEP | 安全/观测非 compatibility；旧 global SSH、updater 分开清理 |
| setting appModal/API clients | REPLACE | 新平台 scopes，internal 系统 token 不暴露给脚本 |
| diff | KEEP | Compare；纯工具不必因原始项目删除 |
| initialization/login/error | KEEP | fresh admin bootstrap，去 auth.json/旧明文密码兼容 |
| backup settings | FUTURE REPLACE | 14；旧导出包含 db/upload+选定目录，没有完整 workspace 一致性保证 |

目标导航：Dashboard；Repositories{Credentials,Repositories,Subscriptions}；Tasks；Environment；Config Assets；Code Editor；Runtime；Logs；Compare；Settings；Backup；API。当前 defaultProps 仍 flat menu、Scoped ENV 通过旧 ENV 链接、新 workspace 为二级路由。4.5B 合并已实现的入口；未实现页面不要做空壳假功能。权限/错误展示/自定义 base URL/响应 Secret masking 必须一起验证。
