> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Discovery 兼容性

`managed_discovery.sh` 通过 library-only 入口加载原 `update.sh` 函数。没有重新实现 JS/Python/TS/Shell 注释解析器。暂存区提供原目录变量、原 crontab.list 副本，并拦截原添加/删除 API 调用，生成计划后由 CronService 批量应用。

| 项目 | 保留行为 |
| --- | --- |
| whitelist / blacklist | 原 egrep 包含/排除算法，先检查正则语法 |
| dependences | 原扩展名范围内另选依赖并复制；随后复制全局 deps，再复制选中脚本 |
| extensions | 保留空格或竖线分隔；默认使用原配置的扩展名 |
| 嵌套目录 | 保留相对路径，不扁平化 |
| cron / new Env / name | 原注释优先级和默认 Cron 规则；包括嵌套 basename 注释回退的历史语义 |
| 已存在路径 | 不自动覆盖既有 Task 的 Cron 时间、名称等手工元数据 |
| 新路径 / 删除或重命名 | 原增删判定；重命名视为旧路径删除与新路径添加 |
| autoAddCron=false | 仍复制脚本，不新增 Task |
| autoDelCron=false | 保留原 Task 和已复制旧脚本 |
| scripts 目录名 | 复用 legacyCheckoutName(remote, subscription.branch)，不是 alias |
| command / cwd | 原 `task <legacy目录>/<相对路径>` 与原 makeCommand；无 Worktree 直连 |

Managed 对路径作额外安全检查：拒绝符号链接、特殊文件、以减号开头或含空白/非 ASCII 安全字符的文件名；正则、扩展名、路径异常均失败而不发布。全局 deps 同样检查。订阅 proxy 暂仅支持 Legacy，Managed 明确拒绝非空值，避免悄悄忽略。

旧命名空间碰撞仍可能存在，Phase 1 的碰撞警告继续返回。特别是 Legacy 与 Managed 使用同一 scripts 目标时，Legacy 不参与新锁；用户应消除冲突。Managed 计划还拒绝删除命令不属于精确目标前缀的 Task。
