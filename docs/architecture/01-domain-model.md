# Domain Model（目标）

| Domain | 所有权/边界 |
| --- | --- |
| Credential | 独立可复用 Secret + transport policy；Repository 引用，不由 Subscription 持有 override |
| Repository | 远端 normalized identity + 默认credential/profile；不含 branch identity |
| Worktree | 独立代码 Workspace；ref/local state；可被多个 Subscription/Task 引用；非可任意删除 checkout |
| Subscription | 必须关联 Repository，ref/worktree、sync schedule、discovery policy、env profile；失败保留成功水位 |
| Task | 稳定ID、source key、entrypoint/args/cwd、ENV/runtime/hooks引用；可手工建立、subscription_id可空 |
| Schedule | 一个 Task/Sync 的触发规则；不携带 Shell command 作为 domain truth |
| TaskRun | 单次dispatch/执行/取消/退出事实；唯一run_id，独立于pid和脚本名 |
| Environment | unique Global + Repository Profiles + Task Override；显式UNSET/Secret；纯解析输出 |
| Config Assets / Task Hooks | Phase 5 已实现：不可变内容版本、继承绑定、执行副本与结构化生命周期 |
| Runtime | Phase 6–8 未来资源；此时不建表或伪造实现 |

Task/Schedule/TaskRun 分离能避免 Crontab 的状态、当前pid、多个schedule、source identity混杂。4.5B operational baseline仍留旧桥表，Phase9/10再实施领域拆分。Worktree purpose可作为created_by metadata保留，但删除权依赖引用+lease，不看USER/SUBSCRIPTION标签。
