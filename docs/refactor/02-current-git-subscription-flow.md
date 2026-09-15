# 当前 Git / Subscription 调用链

> 下文为 Phase 0 Legacy 快照。显式 Managed 分支及最新架构图见 [Phase 3 Git 管线](phase3/02-managed-git-pipeline.md)；旧分支仍保留。

> Phase 0 历史快照：本文记录重构前基线。当前代码已新增 GitCredential / Repository、可空订阅引用及兼容适配器；现状增量、测试和限制见 [Phase 1 报告](../../PHASE1_REPORT.md)。旧执行管线保持基线行为。

## 两个入口到共同执行器

| 步骤 | 文件 / 函数 | 输入 → 输出 | 副作用 |
|---|---|---|---|
| 手工 UI | `src/pages/subscription/index.tsx:runSubscription` | 选中 id → PUT subscriptions/run | UI 乐观更新状态 |
| API | `back/api/subscription.ts` PUT `/run` | number[] → `SubscriptionService.run` | queued DB 状态 |
| 手工 Service | `back/services/subscription.ts:run/runSingle` | id → DB doc → formatCommand | 进入 subscription queue |
| 定时恢复 | `back/loaders/initTask.ts` default | SubscriptionModel 全部记录 → handleTask，排除 is_disabled | 内存注册 job |
| 定时 Service | `SubscriptionService.handleTask` | doc schedule_type → formatUrl/formatCommand | cancel + createCronTask 或 createIntervalTask |
| 定时触发 | `back/services/schedule.ts:createCronTask/createIntervalTask` | cron/interval → runTask | 与手工入口汇合 |
| 凭证与参数 | `back/config/subscription.ts:formatUrl/formatCommand` | doc → `SUB_ID=id ql repo "url" "whitelist" "blacklist" "dependences" "branch" "extensions" "proxy" "autoAdd" "autoDel"` | HTTP 密码注入 URL；SSH host 替换 alias |
| 执行 | `ScheduleService.runTask` / `shared/pLimit.ts:runWithSubscriptionLimit` | command → spawn `/bin/bash` | 继承父 cwd/env/uid/gid，采集 stdout/stderr |
| 前置/日志 | `SubscriptionService.taskCallbacks` onBefore/onStart | alias + 时间 → log 路径 / pid | sub_before 通过 promiseExec 独立子 shell 执行；失败记录后继续 |
| Shell 入口 | `shell/update.sh:main` | positional args → get_uniq_path / update_repo | import_config，创建日志目录 |
| Git | `shell/share.sh:git_clone_scripts` | URL、repo_path、branch、proxy → shallow clone | 文件系统 repo 重建 |
| 扫描 | `shell/update.sh:diff_scripts/gen_list_repo` | repo 文件、正则过滤、扩展名 → scripts/list | cp -f 覆盖脚本，依赖辅助文件复制 |
| 差异 | `diff_cron` | scripts.list vs crontab.list 提取 user.list → add/drop lists | 临时列表文件 |
| 自动任务 | `add_cron/del_cron` → `shell/api.sh:add_cron_api/del_cron_api` | 元数据 → `/open/crons` 请求 | 新建/删除 Crontab；通知 |
| API 入库 | `back/api/cron.ts` → `CronService.create/remove` | name/command/schedule/sub_id → Crontabs | 调度注册、crontab.list 重写 |
| 结束 | `taskCallbacks.onEnd` | child close → sub_after / idle / pid null | 写结束标志、关闭 log、SockJS runSubscriptionEnd |

注意：Subscription 表无 exit_code；结束 idle 不证明 clone 成功。`update.sh` 最后 `exit 0`，Git 错误可只呈现在日志中。

## Git 命令与破坏性行为（已执行本地 fixture）

`update_repo` 无条件 `rm -rf ${repo_path}`，再调用 `git clone -q --depth=1 $part_cmd $url $dir`；branch 非空时 `$part_cmd` 为 `-b $branch`。执行路径没有 fetch/pull/reset/checkout/clean 更新步骤，覆盖由删除整个 clone 实现。不要把没有 `reset --hard` 解读为安全保留本地修改。

| 初始状态 | 下一次成功更新 | clone 失败时 |
|---|---|---|
| 不存在 | 建立浅克隆，复制选中的脚本 | repo 不可用，旧 scripts 可能仍存在 |
| tracked modified | 删除，恢复 upstream 内容 | 本地修改已丢失 |
| untracked | 删除 | 同上 |
| local commit | 删除本地提交历史，只剩浅克隆远端 | 同上 |
| detached HEAD | 删除重克隆，切回请求 branch | 同上 |
| merge conflict | 删除包括冲突 index / working files | 同上 |

测试确实构造 Git merge conflict、detached 和 local commit；不只是检查命令字符串。没有公网 Git 访问。

## 目录命名 / 身份不一致

`get_uniq_path`：去 URL 最后 `/`，取末段并去最后点后缀为 repo；取倒数第二段，去 `:` 前部分，再去最后 `.` 前部分为 author；`uniq_path=author_repo`，非空 branch 原样追加 `_branch`。存储 `${QL_DATA_DIR:-$QL_DIR/data}/repo/$uniq_path`，脚本目标为对应 scripts 子目录。

UI `modal.tsx:formatAlias` 用 URL regex 提取并替换 `/`、`.`，追加 branch；DB alias 唯一。但是 **formatCommand 没把 alias 作为目录参数传给 Shell**。日志使用 doc.alias，force remove 使用 repoPath/doc.alias、scriptPath/doc.alias。手改 alias、点号、嵌套 group、特殊 branch 都可能让身份不一致。

- 同 URL 不同 branch：独立 clone，不共享对象；branch `/` 会成为路径分隔符，没有编码。
- 同 URL 同 branch 不同 alias：DB 可以容纳，但 Shell 可能落同一目录；并行 rm/clone/cp 有竞争。
- 不同 host 同 owner/repo/branch：host 通常不参与命名，可能冲突。
- SSH alias 主要用于 SSH host 匹配，不是统一 repository 主键。
- 公网 SSH / HTTP 鉴权、恶意 branch 越界未在真实服务运行：NEED RUNTIME VERIFICATION，使用隔离 Linux fixture 和假的凭证服务补验。

## 自动发现细节

`gen_list_repo` 默认 `RepoFileExtensions="js py"`；subscription.extensions 可用 `|`，转换成 find 的多扩展名表达式；运行器另外支持 mjs/pyc/ts/sh，但默认发现不等于运行器完整支持列表。扫描嵌套目录，whitelist/blacklist 为 egrep 正则。`dependences` 是同仓库**辅助文件匹配与复制**，不是 pip/npm 包依赖！另复制 data/deps、notify.py/sendNotify.js。

`add_cron` 优先解析包含相对文件名的五/六字段 cron 行，其次 `cron:`，再 `cron "..."`，最后 DefaultCronRule 或随机分时。名称优先 `new Env(...)`，其次 `name:`，最后 basename。这是基于文本的统一 parser，非按 Python/JS/Shell AST 分别解析。嵌套文件仅写 basename 的普通 cron 行无法匹配相对路径，fixture 得到默认时间；`cron:` 不受此限制。

- Auto Add：新增路径且 autoAddCron true，经 Open API 新建。
- Auto Delete：消失路径且 autoDelCron true，删脚本并删 API task。
- Auto Update：已有路径的 command/schedule 元数据更新未实现；源码 update 调用是注释，重复拉取不刷新 cron 时间。
- Auto Disable：该扫描链未实现自动 disable；删除开关不是禁用。
- API flags 为 null 时 formatCommand fallback true；Subscription constructor 把缺失 flag 转 0；必须保留/明确迁移旧记录与新建差异。
- 自动和手工都是 Crontabs + 相同 scheduler/runner；自动任务有 sub_id 和 scripts 相对 command，并受后续扫描删除控制，手工 task 无此所有权语义。不是两套表，也不能称生命周期完全一致。
