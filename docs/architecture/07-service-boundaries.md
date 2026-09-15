# Service Boundaries

| Service | Owns | Must not own |
| --- | --- | --- |
| CredentialService/Resolver | secret access、private auth transport | Task ENV、任务hook |
| RepositoryService/Storage | identity、bare store、refs/fetch、ownership | discovery metadata/parser、Task运行 |
| WorktreeService | workspace lifecycle/status/lease | scripts copy、shell command生成 |
| SubscriptionSyncService | sync orchestration、success watermark、recovery | credential override、旧URLclone |
| TaskDiscoveryService | 输入policy+workspace→definitions/diagnostics | 执行脚本、安装依赖、HTTP回环 |
| TaskService | stable source identity/reconcile/user overrides | 直接Git clone、解析crontab文本 |
| ScheduleService | schedule lifecycle/dispatch policy/recovery | Task定义真相、业务ENV生成 |
| EnvironmentResolver | pure immutable merge/preview | spawn、写全局文件、修改父环境 |
| Execution Engine | resolve context→spawn/signals/timeout/exit/log/lease | 重新选择credentials/修改Git资源 |
| NotificationService | events→providers | task path/alias身份、shared mutable request fields |
| WorkspaceFileService | boundary-checked code editing | 任意config/secret文件写入 |

目标依赖单向：Domain DB→Projection/Runner；Runner result→TaskRun持久化，不反向修改Task定义。进程间消息需要显式认证/类型/幂等处理；“direct service call”只在Backend同进程可用。旧Shell→OpenAPI是可替换IPC，不应简单关闭导致真实退出状态丢失。

4.5B保留CronService+scheduler transport与TaskShellBridge，按[桥登记](../../TEMPORARY_BRIDGES.md)封装，禁止新模块继续依赖其路径与文本格式。
