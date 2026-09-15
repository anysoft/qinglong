# Dead Code Candidates — 不是删除指令

证据范围：GitNexus current index + back/src/shell/docker/deploy/sample/tests 静态引用，包含动态source/router/CLI人工追踪。没有运行时覆盖率数据；外部管理员脚本不可枚举。名字像旧代码不构成结论。

| Candidate | Status | Evidence | 计划 |
| --- | --- | --- | --- |
| update.sh 中注释掉的 update_cron_api / update_cron_command_api 调用块 | Definitely Dead（仅注释块） | update.sh:198、485–488；注释从不执行 | 4.5B可去注释；不能据此证明整个函数不存在外部caller |
| gitResources repositories DELETE/:id handler | Definitely Dead at current main HTTP mount / DUPLICATE | api/index先workspace后gitResources；workspace.ts:83响应且不next；gitResources.ts:160重复路径 | 删除后注册重复route，保留storage删除保护；独立测试router可达不改变主挂载结论 |
| otask.run_nohup | Likely Dead | back/src/shell/sample/docker测试中只有定义；运行分派走run_normal/conc/desi/run_else | 4.5B再次impact+静态检查后删除，不以Shell图零调用单独证明 |
| api.sh update_cron_api / update_cron_command_api | Likely Dead internally | 除定义只见注释调用；source可能向外暴露 | 旧CLI不承诺，可在4.5B核对后删；保留update_cron（status） |
| share.sh ql_static_repo | Likely Dead | 只有导出定义；实际updater用zip下载 | 可去独立常量；不是dir_repo全部可删 |
| legacyCheckoutName / validateLegacyGitArguments | Still Used | Managed.prepare→SubscriptionGitResolver；Managed.stage→legacyCheckoutName | 先替换context/prefix，不能整删subscriptionGit |
| update.sh scanner / managed_discovery | Still Used | Managed.stage经监督Bash执行，source原scanner | 抽库/重写后删重复实现 |
| git_clone_scripts / bot.sh | Still Used | update_repo与bot；Docker/start条件ql bot | bot退场前不删helper |
| CronService.importCrontab | Still Used | api/cron GET /import明确调用；是否有UI无关 | 新平台不需要该产品功能，但不称dead |
| update.ts /update/data | Still Used | Settings other.tsx:276恢复调用 | 运维替代后收敛，不整文件立即删 |
| env.py/env.js generation / preloads | Still Used | transport复制，preload导入，全局-only不建snapshot | 完整env接替后移除 |
| Task execution lease API | Still Used as resource API / Future integration | Worktree安全/lease测试与服务协议；Task当前无绑定 | 保留，不能当未使用Task功能删掉 |
| shell/start.sh 原生/macOS/Termux分支、sample辅助工具 | Unknown product coverage | 构建/外部CLI入口不由TS图完全表达；没有部署矩阵认证 | DEFER具体发行目标决策，保留启动必需逻辑 |

搜索词 legacy/managed/git_mode/compat/compatibility/fallback/migration/old/deprecated 的逐行原始证据见 compatibility.json。里面包含测试、注释、字符串和安全fallback；不能批量删命中行。
