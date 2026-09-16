# Domain Model（目标）

> Phase 9 当前架构：Tasks 是定义事实来源；参见 [Task Domain](13-task-domain.md)。下文与此冲突的 Crontab 定义描述属于此前阶段，调度/结果桥仍按 TEMPORARY_BRIDGES 登记。


> **当前基线：Phase 8，schema v5。** Runtime Core 同时支持 Python 与 Node；Node 新增 exact PackageManagerToolchain、NodeEnvironment、不可变 Revision/Build，独立 node_modules 与共享 store。下文早期阶段描述保留为演进记录；当前结构见 [Node Runtime 架构](12-node-runtime-environments.md)，最新约束以该文档和 [Phase 8 schema](../refactor/phase8/10-schema-evolution.md) 为准。Task/Hook 仍使用现有 Runner Bridge，未实现 Phase 9/10 绑定。

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

## Phase 6 已实现 Runtime Domain

RuntimeProvider(PYTHON/PYENV) → RuntimeInstallation(CPYTHON + exact version)；RuntimeOperation 独立于 TaskRun/SyncRun。Phase 6 无 RuntimeEnvironment、venv/package、Task/Hook Runtime FK。后续连接见 [Runtime 架构](10-python-runtime.md)。

## Python Environment (Phase 7)

PythonEnvironment 是独立平台资源，持有 Desired Revision 和 Current Build。Revision 固定 Runtime 与直接依赖；Build 固定 venv、resolved packages 与主机/验证 metadata。三类引用均保护 Runtime。没有 Repository/Task 自动绑定。
