> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](docs/architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Phase 3 Status

**PASS** — 已实现显式启用的 Subscription Git Pipeline v2。Managed 使用持久 Repository fetch + Worktree FF-only 更新，随后继续原发现、scripts copy 和 Task 执行模型。

基线：`a2f1ac2d`。本次修改未提交、未部署、未升级运行中的数据库。保留工作区原有的 `refactor/1.roadmaps.md` 用户修改。

| 项目 | 状态 |
| --- | --- |
| Managed Subscription | PASS |
| Repository Fetch Pipeline | PASS |
| Worktree Binding | PASS |
| Discovery Compatibility | PASS |
| Scripts / Cron Compatibility | PASS |
| Failure Preservation（Git 失败不触碰上一版发布） | PASS |
| Lock / Lease | PASS |
| Legacy Regression | PASS |
| API / UI | PASS |
| Browser Validation | PASS |

## Tests

**276 passed / 0 failed / 3 skipped**，在原 245 passed 基线上新增 31 项；原有 3 项跳过未增加。

| 测试集 | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| 原 test/back + test/front | 176 | 0 | 3 |
| Phase 0 characterization | 17 | 0 | 0 |
| Phase 1 + Phase 2 | 52 | 0 | 0 |
| Phase 3 | 31 | 0 | 0 |
| 合计 | 276 | 0 | 3 |

验证命令使用 Node 22：

```bash
node diagnostics/phase0/run-tests.cjs existing
node diagnostics/phase0/run-tests.cjs baseline
node --test tests/phase1/*.test.cjs tests/phase2/*.test.cjs tests/phase3/*.test.cjs
npm run build:back
npm run build:front
```

最后新增的两项 lease 测试单独执行通过；完整阶段测试 81 项与新增 lease 2 项合计 83 项。验证日志摘要在 `diagnostics/phase3/verification.json`。

真实本地 Git 测试覆盖首次初始化/绑定、fetch、FF、新分支、分支切换/删除、无变化重复运行、dirty/untracked/ahead/detached、force-push 分叉、工作区/仓库存储缺失、凭证失效、符号链接拒绝、原发现规则、copy/注册失败恢复及重试。原 Phase 1/2 凭证、API、跨进程锁和恢复测试全部保留。

构建：后端 PASS，前端 PASS；Shell 语法和 Python helper 编译检查 PASS。没有改 package.json 或依赖版本。

浏览器：构建产物 + Chrome + 临时 SQLite + 真实本地 Git + 实际订阅/工作区路由；创建 Managed、选择仓库/分支、预检、首次运行、再次无变化运行、状态展示、dirty 失败保留、引用导航、编辑界面切回 Legacy 均 PASS，page errors 为 0。Phase 2 工作区浏览器回归也 PASS。调度传输使用测试替身，浏览器运行在进程内调用同一 Managed 服务，没有声称验证生产 gRPC 守护进程的完整启动链。

## Production Behavior Changed

**NO for existing behavior。** 旧 URL 与旧 Repository-backed 订阅默认仍为 Legacy，不自动迁移。只有显式选择 Managed 的订阅进入新分支。

- Legacy 继续原 rm-rf / clone / discovery / copy / Cron 路径。
- Task 仍执行 scripts；command、cwd、task.sh、otask.sh、调度队列与执行器未改。
- Global ENV、依赖、Runtime、Task Source、Backup v2 均未进入本阶段。
- `diagnostics/phase3/legacy-integrity.json` 记录关键文件及 8 个原 Shell 函数的完整性检查。

## Database Changes

新增幂等事务迁移 `phase3-managed-subscriptions`。Subscriptions 增加 git_mode、可空 worktree_id 外键、最近成功 commit/time、最近状态/阶段/错误码；Worktrees 增加 purpose。历史订阅默认 LEGACY，历史工作区默认 USER。外键和服务层共同阻止删除被引用工作区。

## API Changes

原订阅创建/编辑允许 git_mode，MANAGED 保存前预检。新增 `POST /subscriptions/:id/managed/preflight` 和 `PUT /subscriptions/:id/git-mode`。列表/详情提供绑定与最近同步信息，run/stop/logs 继续原接口。客户端不能设置本地路径、绑定 ID 或同步结果。Phase 1 convert 操作复用。

## UI Changes

订阅表单增加 Legacy/Managed 选择和已保存配置预检；列表显示模式、仓库名称、工作区链接及最近结果；详情展示阶段/错误/提交信息。工作区列表显示创建用途和订阅引用。Managed 删除提示明确保留 scripts 与工作区；切回 Legacy 后仍可查看保留的绑定。

## Subscription Mode Model

LEGACY 为显式默认；Repository 引用不等于启用 Managed。启用失败不修改旧模式或配置。切回 Legacy 不删除持久 Git 数据。新模式与订阅 enabled/disabled 状态分离。

## Managed Pipeline

复用 Phase 1 凭证解析和 Phase 2 Repository/Worktree/Git runner：Initialize（必要时）→ Fetch → Ensure → clean/ahead/diverged 检查 → FF-only → 暂存发现 → 源状态复核 → scripts 与 Cron 发布。没有新提交仍做发现和发布，确保失败后可重试。

凭证顺序保持 Subscription override > Repository default > anonymous；覆盖只用于本次网络操作，不修改仓库默认凭证。Git 原始输出与认证信息不进入错误摘要。

## Worktree Binding

同仓库同分支共享原 branch_key 工作区；不同分支创建新绑定，旧工作区保留。USER/SUBSCRIPTION 表示创建用途，实际引用单独展示。绑定落库在仓库/工作区锁内完成。Delete 与 Remove Record 检查所有引用；删除订阅不级联删除 Git 数据。

## Lock Ordering

Subscription → Repository → Worktree → Publication → 原 Scheduler mutation lock。Repository 与 Worktree 锁覆盖 FF、发现、copy 和 Task 发布；busy 不等待破坏性操作完成后强行覆盖。Bash 扫描器复用原 POSIX helper 的进程监督、超时和释放机制。预检对执行租约返回 WORKTREE_BUSY，不接受缓存 clean 快照。

## Discovery Compatibility

原 diff_scripts/gen_list_repo/diff_cron/add_cron/del_cron 函数保持不变。内部适配器将其输出重定向到临时 scripts 和 crontab.list，拦截增删计划，然后由 CronService 复用原 Crontab、makeCommand、调度注册及 crontab 写入。扩展名、正则过滤、依赖复制、嵌套路径、注释和自动增删规则经过实际 Shell 测试。

## Legacy Equivalence

完整性检查与 Phase 0 实际 clone/Task 测试共同验证原行为。关键历史语义：alias 不是 scripts 目标目录；同一路径文件更新不会自动修改已有 Task 的 Cron 时间/名称；重命名按旧删/新增处理。没有借机改变这些语义。

## Failure Semantics

Git、认证、引用或 Worktree 状态失败时，不执行下游 Task diff。发现/copy 在隔离目录中完成，失败不触碰 live scripts。发布失败尝试恢复旧目录、原 Task ID/定义及调度注册；Managed 系统 crontab 安装失败严格报错。最近成功 commit/time 保留，最近失败单独记录。

发布前写入私有 recovery.json；补偿再次失败保留恢复材料并报告 MANAGED_RECOVERY_REQUIRED。通知失败不撤销成功发布。用户停止标记 CANCELLED；没有新增 Task 执行租约。

## Security

Managed 路径由服务端 ID 和原安全命名规则生成，拒绝 symlink、特殊文件及不安全文件名；对 source、destination、通知文件、deps 和 crontab 路径检查边界。复用凭证隔离/脱敏，Bash 不接收 Git 凭证环境。拒绝无效正则、扩展名及超出精确 scripts 前缀的删除计划。

GitNexus 在相关修改前执行 impact；锁路径与 setCrontab 的 CRITICAL、Managed prepare 的 HIGH 已在编辑前说明。最终 compare 使用 develop；另外使用临时 Git index 纳入新增文件，不改变用户真实暂存区。含新增文件的最终比较报告 47 个文件、208 个符号、118 条受影响流程，风险 CRITICAL；详见 diagnostics/phase3/gitnexus-review.txt。图分析仍存在动态接收者和流程截断，不能把 UNKNOWN 视为无影响；结合直接源码审查、完整性检查和回归验证。

## Known Limitations

1. SQLite、目录替换和外部调度器没有跨系统事务。发布窗口内 SIGKILL/断电或补偿再次失败，不保证自动恢复/零中断；保留恢复材料，见失败恢复文档。崩溃可能留下 RUNNING 最近状态，下次运行重新记录。
2. Legacy 不参与 Managed 发布锁；同 scripts 命名空间混用模式或多订阅过滤规则不同仍有历史覆盖风险。保留 Phase 1 碰撞警告，应消除冲突配置。
3. Managed 暂不接受订阅 proxy；带空白、Unicode 或特殊字符的文件名，以及含空白、无法被原 Shell 正确处理的路径不在当前兼容范围。明确失败而不偷偷改写参数或文件名。
4. 仅为 Git 同步管线使用工作区；不支持 Task 从 Worktree 直接运行。外部直接磁盘写入不遵守服务锁；没有对任意外部编辑提供快照隔离。
5. 浏览器及端到端测试隔离了调度传输，没有对全部远程 Git 服务商、网络文件系统或生产部署方式作认证。

## Important Findings

Managed 的真正边界是替换 Git Source，保留旧发布与执行语义。不能根据 HEAD 未变化跳过整个订阅，也不能把工作区 clean 等同于可同步：ahead、本地分叉、缺失远端或占用中的租约都应失败。工作区用途与当前订阅引用是不同概念。

## Phase 4 Preconditions

建议入口：**Scoped ENV — Global / Repository / Task**。先设计覆盖顺序、合并与兼容测试；继续保留当前 scripts/Task 模型，除非下一阶段另行明确授权迁移执行源。Phase 3 未实施 ENV 隔离或 Runtime 改造。

## 交付文档

完整设计、兼容性、迁移与恢复说明见 [docs/refactor/phase3](docs/refactor/phase3/01-managed-subscription-model.md)，共 8 份文档；实际双模式架构图见 [Managed Git 管线](docs/refactor/phase3/02-managed-git-pipeline.md)。
