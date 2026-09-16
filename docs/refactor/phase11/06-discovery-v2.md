# Discovery v2

DiscoveryPolicies 属于 Subscription，并通过当前 Subscription.worktree_id 绑定 Worktree。配置 enabled、includes/excludes 相对 glob、languages、version；统计保存 last_reconciled_at 和 last_result。

扫描直接读取普通 Worktree 文件，不复制 scripts、不生成 command、不解析 crontab.list。不跟随符号链接；检查真实路径并用 O_NOFOLLOW 读取最多 64 KiB metadata。自动忽略 .git、node_modules、.platform、venv/.venv、__pycache__ 和 runtime 管理目录。

支持 .py/.js/.mjs/.cjs/.ts/.sh；无 cron metadata 的文件也能发现 Task。glob 支持 *、**、?，拒绝绝对路径、..、反斜杠、控制字符；不执行正则 DSL。cron/name 仍可从注释声明中读取。

Preview 只读取，稳定输出 CREATE/UPDATE/RETIRE/UNCHANGED。Apply 重新扫描并校验 Policy version，在单个 IMMEDIATE 事务中批量更新 Task/Source/Runtime 声明/Settings/Trigger 和统计。5000 文件测试检查数据库查询批处理。源移除停用任务并移除仍归 Discovery 所有的 Cron，保留用户资源和历史。
