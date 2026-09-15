# 风险 / Bug / Concurrency 记录

> Phase 0 历史快照：本文记录重构前基线。当前代码已新增 GitCredential / Repository、可空订阅引用及兼容适配器；现状增量、测试和限制见 [Phase 1 报告](../../PHASE1_REPORT.md)。旧执行管线保持基线行为。

严重度用于后续重构和数据损失评估，不宣称以下全部是未认证远程漏洞。面板本来授予管理员执行任务命令能力；必须区分管理员能力、脚本输入与受限 App scope 的越权边界。Phase 0 未修复生产逻辑。

| ID / Severity | 文件 / 位置 | 影响 / 证据 | 安全重现 / 后续建议 |
|---|---|---|---|
| R01 Critical（数据完整性） | shell/update.sh:update_repo | 无条件rm -rf repo后浅clone；本地modified/untracked/commit/detached/conflict全部丢失 | baseline五类真实本地Git状态已验证；未来迁移先保全snapshot，明确legacy clone替换与用户worktree区别 |
| R02 High | back/services/env.ts:set_envs 的 js_env_string | `${...}` 未转义，可在任务Node preload执行表达式；JS/Shell语义不同 | vm中dummy `${6*7}`→42，无系统操作；后续安全编码需独立变更与兼容评估 |
| R03 High | config/subscription.ts:formatUrl/formatCommand；ScheduleService.createCronTask | 用户名/密码直接进入URL和command；调度创建日志记录command，Git配置/错误输出也可能含凭证 | dummy凭证命令测试已验证；线上泄漏范围NEED RUNTIME VERIFICATION，审查日志脱敏、Credential引用和child argv |
| R04 High | update.sh:get_uniq_path；SubscriptionService.remove/taskCallbacks | alias与Shell目录算法不同，同repo同branch不同alias可共用目录；force remove可能删错/漏删 | 本地同URL+branch目录重复验证；手改alias经隔离API补验；未来引入稳定repo/worktree ID及唯一性 |
| R05 High | back/api/config.ts POST /save vs services/config.ts:getFile | scripts写入用QL_DIR/data，读取用QL_DATA_DIR；外置data布局读写不一致 | 设QL_DATA_DIR到另一临时目录，调用detail/save核验；本阶段静态确认路径，尚未HTTP实测 |
| R06 High | config/subscription.ts；update.sh:gen_list_repo；config/util.ts:getInstallCommand/getGetCommand | URL/branch/filter/extension/dependency name拼接Shell，双引号不阻止$()；find表达式eval；Joi string并非shell escaping | 不执行恶意输入；后续在临时marker沙箱验证不同scope输入可达性，用argv/拒绝规则设计；Task Command/hooks本身为授权执行面 |
| R07 High | update_repo/gen_list_repo；DependenceService | clone/cp与任务并行、依赖全局安装/清理与任务并行，没有repo/runtime lease | 两订阅同目录交错rm/clone可失败，task读到更新中脚本；安装替换时import失败；建议以后统一资源锁与快照 |
| R08 High | data/env.ts、data/subscription.ts、data/open.ts、data/system.ts；preload文件 | ENV、Git credential、app secret、通知secret明文存储；用户登录密码另有scrypt不能混淆 | 仅查model和dummy测试；后续凭证资源权限/加密、日志脱敏，不改历史DB |
| R09 Medium | update.sh:add_cron/gen_list_repo | 嵌套basename注释回退默认时间；既有路径schedule改动不自动更新 | fixture nested/annotated.js实际得到默认0 0；记录真实parser，未来扫描器显式兼容 |
| R10 Medium | task.sh尾部；share.handle_task_end；CronService.status | 外包装exit0与脚本真实失败不同；退出码靠status API，API失败可失真 | SQLite test验证exit7写RunningInstances；外层返回0特征和API失败/kill场景需保留测试 |
| R11 High | SshKeyService.generateSingleSshConfig/generateGlobalSshConfig | StrictHostKeyChecking no；SSH key存在DB、ssh.d；proxy写入ProxyCommand | 不连接外部主机；未来凭证校验/known_hosts，global key向所有host匹配的权限面需单独设计 |
| R12 Medium | preload/sitecustomize.js:run / sitecustomize.py:run | 可预测/tmp/env_PID.json环境转储，默认创建权限依赖umask；可能残留/同机symlink竞争 | 不读取真实环境；在隔离容器假ENV+预建symlink检查；建议以后私有临时目录/安全创建并finally清理 |
| R13 Medium | EnvService.set_envs、pin/unPin | 三份文件分别写无联合原子性；pin后未立即重生成；trim语言差异 | whitespace特征测试；并发生成失败窗口待故障注入验证 |
| R14 Medium | Subscription.taskCallbacks | 秒级日志名、无持久化exit_code，onEnd idle可能掩盖clone失败 | 同alias同秒两次执行的隔离服务验证；未来execution ID |
| R15 Medium | Config/script文件操作 + resolveFileAccess | 已有realpath/黑名单/悬空symlink防护，但检查到使用间仍有TOCTOU窗口；Shell复制不共享这套校验 | 已有file-access-security测试，勿误报完全无防护；后续并发symlink换向验证 |
| R16 Medium | native start / Docker ENV / file paths | QL_DATA_DIR与硬编码QL_DIR/data依赖路径不一致 | 自定义数据根容器矩阵；路径provider需覆盖installer/preload/log/SSH |
| R17 Medium | NotificationService.notify 实例 title/content/params | mutable实例字段，多个并发notify可能覆盖上下文 | 静态潜在风险；假provider延迟并发测试后确认，未发送真实通知 |
| R18 Medium | 当前lock依赖树 buffer-equal-constant-time | 宿主Node26 SlowBuffer移除导致JWT依赖加载失败，四个既有安全测试文件无法运行 | 本机Node26复现；隔离Node22重跑，不能以升级依赖“顺手修” |

## Concurrency / Locks 实际边界

| 场景 | 已有保护 | 未覆盖 |
|---|---|---|
| 两Subscription更新同一repo | subscription PQueue总并发限制 | 无按repo/alias互斥，rm/clone/cp/list文件均可冲突 |
| 两Task跑同script | Node runCron可kill旧同id，manual queued_token；allow_multiple_instances | 不同id同script无锁，手工与定时非统一队列；system crond绕过队列 |
| Repo更新时Task执行 | scripts是拷贝，不直接读clone，可避免部分repo删除影响 | cp逐文件覆盖scripts，无发布快照/原子切换；用户脚本会写共享cwd |
| Dependency install/clean时Task执行 | installer串行；Node path cache锁 | 无runtime共享读锁/写锁，installed payload可消失 |
| 删除Task时进程运行 | CronService.remove→cronClient.delCron取消调度并删除DB；stop是独立操作 | remove未调用stop/kill；child可继续运行，status查不到task会跳过；未建立执行租约 |
| DB写/调度变更 | SQLite IMMEDIATE事务/SQLITE_BUSY retry；schedulerMutation file lock贯穿DB与注册 | 非分布式执行锁，DB与进程启动不能同事务 |
| 文件写/缓存 | writeFileWithLock、proper-lockfile；node path cache flock | 并非所有Shell cp/rm都受此锁保护 |

## UNKNOWN / NEED RUNTIME VERIFICATION

公网SSH/token鉴权、UI端到端、crond实际触发、Docker/Native版本矩阵、全局包冲突安装、进程kill极端时序、恶意路径/符号链接/注入HTTP可达性、真实通知提供方未实测。建议以fake credentials/local HTTP、临时data、隔离容器开展；不得用生产仓库或secret重现。
