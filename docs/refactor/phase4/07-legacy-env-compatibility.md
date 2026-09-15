# Legacy Compatibility

改 Task execution 之前新增并通过三语言实际 task.sh characterization；原 Phase 0 基线也先运行通过。真实确认：enabled 重复值 A&B、disabled 不生成但宿主同名仍可见、Shell trim/Node-Python 保留空格、Node `${6*7}` 产生 42 而其他语言保持字面值。

EnvService、Envs、原 /api/envs /open/envs、global env.sh/js/py 生成和原 Global 管理页面保持。新的入口是环境页按钮和独立 Scoped 页面；不是替换旧 Global 编辑器。

无配置 Task 不创建 Snapshot；沿原 otask/preload 的 Global 加载路径执行。已有 Profile 或 Task entries 才启用运行隔离。新 overlay 在语言 Global 导入之后应用，统一的是新 Scope，不是重新定义旧 Global。

| 历史行为 | Phase 4 |
| --- | --- |
| Legacy clone / Managed fetch / Worktree update / discovery / scripts copy | 保持；仅删除 Repository 增加 Profile 引用保护 |
| Cron command / schedule / extra / manual queue / runCron | 保持 |
| scripts 执行、work_dir、Python/Node executable / dependency 机制 | 保持 |
| Global API、同名拼接、disabled、position/labels | 保持 |
| 老任务 before/after 与日志状态 | 保持；Scoped 分支增加快照及脱敏 |
| 自动 Task 归属 | 继续 sub_id，不复制 Profile 或变量 |

兼容测试中只补充新外键对应的 ORM 表及迁移账本 21；原 Crontab 无 sub_id FK 的断言继续保留，新 env_profile_id FK 单独验证。未删旧测试、未增加 skip，未顺手修前端历史类型债务。

本阶段不实现 Config Assets、Hooks v2、Worktree Task Source、pyenv/venv、Node versions 或 Backup v2。
