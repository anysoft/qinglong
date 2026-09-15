> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Repository-Worktree Coupling Analysis

> Phase 0 历史快照：本文记录重构前基线。当前代码已新增 GitCredential / Repository、可空订阅引用及兼容适配器；现状增量、测试和限制见 [Phase 1 报告](../../PHASE1_REPORT.md)。旧执行管线保持基线行为。

当前系统没有独立 Repository 或 Worktree model。Git clone 含 `.git` 与 working files，update_repo 认为整个目录都可以重建。因此 **Git storage 与检出目录在 clone 中耦合，但 Task cwd 通常是 scripts 副本，不是 repo 根**。

| 位置 / 符号 | 当前假设 | 分离 Git Storage / Worktree 必改边界 |
|---|---|---|
| shell/share.sh:git_clone_scripts | git clone输出目录包含.git与检出文件 | bare store与checkout路径不同，不能对bare执行当前扫描 |
| shell/update.sh:update_repo | 删除repo_path就是更新准备 | 禁止把worktree管理目录当临时clone删；legacy adapter单独保留 |
| update.sh:get_uniq_path | URL/branch字符串是文件身份 | stable repo/worktree ID，显示alias与物理路径分离 |
| update.sh:gen_list_repo | cd repo_path，find可扫描所有候选；拷贝至scripts/uniq_path | scanner读worktree；明确是否仍物化scripts副本/发布快照 |
| update.sh:diff_cron/add_cron/del_cron | scripts路径与crontab.list文本即discovery identity | 持久化发现源/相对路径/用户覆盖关系，保留旧命令 |
| config/subscription.ts:formatCommand | positional ql repo命令、不传alias目录 | 兼容旧CLI，新的资源解析不可从URL重复猜目录 |
| SubscriptionService.taskCallbacks | alias就是log目录 | execution ID与旧alias日志兼容映射 |
| SubscriptionService.remove(force) | scripts/alias和repo/alias属于此订阅 | 检查共享repo/worktree引用，不能按alias级联删除共享存储 |
| shell/otask.sh:enter_script_workdir | scripts下相对路径；work_dir另可指定 | Resolver明确cwd/script absolute path，兼容basename调整 |
| CronService.makeCommand/getLogName | command文本决定运行与日志身份 | 结构化context保持legacy command/log_name覆盖 |
| SshKeyService.setSshConfig | private key生命周期绑定subscription alias | 独立credential引用、共享时不随一个subscription删除 |
| ConfigService / ScriptService | 编辑的是scripts副本，非Git检出 | UI保存回哪一层必须明确，不应无声改变编辑语义 |
| DependenceService / preload | 共享global包环境，与repo identity无绑定 | runtime/worktree lease与依赖snapshot，保留旧global fallback |

## 身份矩阵

- Subscription identifier：DB id，Shell SUB_ID；alias另用于SSH/log/删除。
- Clone path：URL派生uniq_path（branch原样后缀）。
- Task script path：scripts/uniq_path/relativeFile，自动写入command。
- Task cwd：scripts下文件dirname或显式work_dir。
- Log identifier：Task由command/id/log_name派生；Subscription用alias。

这些不是同一个key。未来简单添加bare目录并把repoPath指过去，会破坏scanner、force删除、脚本编辑/拷贝、自动发现和日志关联。先建路径/身份映射兼容层，再选择是否更改脚本执行位置。
