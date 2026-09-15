# Unified Scoped Environment — 当前实现

Base Runtime ENV → Global → Repository Profile → Task Override → immutable Full Execution Snapshot → Child Process。

Global/Profile/Task 内 key 唯一，值为 literal string，空字符串/空白/Unicode/多行均保持；disabled 不参与、UNSET 删除，删除 override 恢复低层值。Profile 选择 Task > Subscription > Repository default；显式选中 disabled/missing/wrong-repo 失败。

Base allowlist：PATH、HOME、LANG、LC_*、TMPDIR、TZ、TERM、QL_DIR、QL_DATA_DIR、BACK_PORT、GRPC_PORT。任务需要的端口使 SDK/status bridge 能连接当前实例；JWT、Backend token、DB/Git Secret 不继承。不使用 process.env 全量拷贝，不改父进程。

Resolver 输出完整变量 map，不是 overlay。每次执行，包括 Global-only、no-ID/editor、手工/调度，都创建独立 owner/snapshot.json/environment.sh，私有 0700/0600、参数只传不透明路径、结束清理、崩溃回收核对 owner。既有运行冻结，下一次读取新配置。

Panel 单一 Environment 入口含 Global、Repository Profiles、Task Overrides；Global 使用相同 ScopedVariable contract。原 EnvService 只作 B13 SDK bridge，使用同一 store 并屏蔽 Secret，数字 status 是内部表示，不是第二种产品语义。

已删除 generated env.py/env.js/Global shell 文件、全局复制、聚合与模板求值；environment.sh 只属于单次 snapshot。shell/env.sh 为运维工具；/api/env.js 为前端非 Secret server config，不属于 Global generator。

四语言 literal/空白/UNSET、50 个同时运行冻结与隔离、父进程隔离、Secret 预览/日志/REST/错误、流式 UTF-8 脱敏均通过。SQLite 仍 plaintext at rest，不宣称加密；非 ENV preload 职责见桥登记。

## Phase 5 执行快照与 Hook 派生

TaskExecutionPreparation 在同一数据库读事务冻结 ENV、Config revision 与 TaskHook plan。BEFORE 的 PLATFORM_HOOK_OUTPUT 只更新本次 derived ENV，原始 preparation、Backend process.env 与 ENV 数据库保持不变；其他 Hook 阶段不能提交 patch。新 Secret 先注册到统一流式脱敏器再释放 BEFORE 输出。原 TaskEnvironment CLI/重复 redactor 和 preload 的临时 ENV 回传已删除，ExecutionEnvironmentTransport 继续承担私有 snapshot 传输。详见 [Config Assets / Hooks](09-config-assets-and-hooks.md)。
