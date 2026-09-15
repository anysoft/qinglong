# Discovery / scripts / crontab 深度依赖

## 实际双轨调用

Legacy：Subscription API/timer → ScheduleService → update.sh repo/raw → diff_scripts → gen_list_repo → scripts/list → diff_cron → add_cron/del_cron → api.sh HTTP /open/crons → CronService → DB/调度/crontab.list。

Managed：同调度 ID helper → ManagedSubscriptionService → Worktree.withSync → stage → **复制 live crontab.list 和旧 scripts 到私有 stage** → managed_discovery.sh（source 原 scanner，覆盖 add/del/notify_api 写 JSONL，不调用 HTTP 发布）→ 校验计划 → CronService.publishSubscription → scripts rename + Task DB/调度 → 最近结果。Managed 的发布已是 Domain Service direct call，4.5B 不应重新发明一层 Shell→OpenAPI 替换。

## scripts/ 删除影响矩阵

| Consumer | 真实依赖 | 删除 copy 的必要替换 |
| --- | --- | --- |
| ManagedSubscriptionService.stage | scriptsRoot/.managed-*、previous/recovery.json、rename 发布 | publication resource 或直接 Worktree Task；现有补偿替换 |
| update.sh scanner | gen_list_repo cp；diff_cron 按 command 路径比对；del_cron 读被删脚本元数据 | backend definitions/reconcile，来源稳定 key |
| Task command | add_cron 产生 task uniq/relative；CronService.makeCommand 仅包装字符串 | Crontab→Task entrypoint/args/source binding |
| Task cwd | otask.enter_script_workdir 默认 scripts，相对 work_dir 也从 scripts 起算 | 受边界检查的 worktree cwd；无效 cwd fail-closed |
| Scheduler | 传 command，不直接扫描 scripts；system crond 用导出命令 | adapter 接 Task ID/执行上下文，不能只改目录名 |
| Log identity | Cron getLogName / task.handle_log_path 从 command/path+ID 推导 | TaskRun ID；保留日志读取/留存能力 |
| Dependency copy | gen_list_repo 复制匹配 support files 和 data/deps/* | source自带文件/Runtime 包/Config Assets，各司其职 |
| Script editor | api/script.ts CRUD/download/rename + .swap run；ScriptService 按 scriptPath 解析 | WorkspaceFileService + ephemeral editor run context |
| Config editor | ConfigService data/scripts 特例；api/config save 硬编码 root/data/scripts | 移除跨域写入，编辑器/ConfigAsset 分开 |
| UI task→editor | src/utils/index.ts 从 command 提取 scriptsPath | 显式 source file link，支持自定义数据根 |
| Notifications | scanner 复制 sendNotify.js/notify.py，preload QLAPI | 显式 SDK/runtime 注入；后端 provider 不依赖 scripts |
| Startup/backup/security | initFile/share.fix_config 样本；System export 类型；fileAccess 黑名单 | 新路径 owner/bootstrap/备份边界；安全策略重绑定 |

**结论：TEMPORARY_BRIDGE，不是 REMOVE_NOW。** 立即删除涉及 data/cron.ts、services/cron.ts、managedSubscription.ts、script.ts、config.ts、api/script.ts/config.ts/cron.ts、schedule snapshots/protos、shared/runCron.ts、shell/task/otask/share/update/preload、src/pages/script/crontab/config、src/utils/index.ts、初始化/部署/备份及 tests。只改变 work_dir 无法解决 entrypoint identity、编辑器写入和执行租约。

4.5B 允许将 bridge 路径改为按 subscription ID 命名、把扫描器从 update.sh 抽到独立内部库、用 DB 定义生成 scanner 输入；不在该阶段实现 Worktree 直跑。Phase 9 绑定、10 Runner+lease、11 DiscoveryPolicy、12 editor 完成后才能清理最后 scripts 消费者；不能承诺 Phase 10 一结束就删整目录。

## crontab.list 谁写/谁读

- Writer：CronService.setCrontab；create/update/remove/启禁/autosave/publishSubscription 都调用；autosave 有 demo 写空分支。system 模式安装 `crontab file`，node 模式仍写文件（部分行注释）。
- Readers：system crond 读安装后的调度表；update.sh gen_list_repo/del_cron/update_raw 根据导出文本猜 Task；task.sh handle_log_path 在无 ID 时反查；Managed stage 复制该文件供同一 scanner。
- DB 是主领域定义来源，但 scanner 把文本当 existence/identity truth；文本滞后会误判新增/删除。不要称文件“仅 scheduler output”。
- importCrontab 是另一个显式 `/crons/import` 入口，读取 `crontab -l` 反导 DB（不直接读文件）；新平台不支持此导入，可在 4.5B 删除。
- 目标：DB→scheduler projection 单向。4.5B scanner 从 DB 生成私有输入，移除无 ID 反查依赖或明确内部 editor context；crontab.list 对 system adapter 仍 TEMPORARY_BRIDGE 到 10。保留 scheduler mutation/readiness/补偿。

## Discovery 行为判定

| 行为 | 类别 | 目标 |
| --- | --- | --- |
| nested paths/extension filters/include/exclude | 真正平台能力 | TaskDiscoveryService，路径安全+明确 glob/regex 类型 |
| cron/name metadata | 有价值能力 | 标准显式 metadata；允许语言注释，不执行源码 |
| new Env(...) 文本抓名称 | QingLong 历史约定 | REMOVE；不引入脚本执行型发现 |
| 随机/default Cron fallback | 历史语义 | 删除随机默认；无 schedule 的定义默认不自动调度/给诊断 |
| 命令路径决定存在性、已存在不更新 schedule | compatibility | source key + diff + 用户覆盖策略 |
| find/grep/awk/perl/eval pipeline | Shell detail | backend parser/filter；不要移植 eval |
| support-file copy 与 global deps copy | staging / runtime bridge | 暂隔离；后分离源码/依赖/配置 |
| auto add/delete toggles | policy 值得保留 | 显式 reconcile 策略、只操作 owned tasks，缺失源可退役 |
| Shell notify + colon split JSON | implementation/compat | typed definition/events，避免冒号/空格破坏 payload |

目标：Worktree → DiscoveryPolicy → TaskDiscoveryService → DiscoveredTaskDefinition[] → TaskService.reconcile()。Definition 至少 source_key、relative_path、language、entrypoint、args、cwd、name、schedule?、content hash、diagnostics；不含凭据。锁内核对 commit，失败保留上次发布；扫描不安装包、不执行脚本。4.5B 只提供 adapter 边界，完整模型/trigger 在 Phase 11。
