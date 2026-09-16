# Phase 10 — Execution Resolver

复用 TaskResourceResolver 的 Task → Subscription → Repository Runtime Default 优先级，不复制资源选择规则。

1. SQLite 一致性事务读取 Task、Source、Settings、Runtime Binding、Worktree、Scoped ENV、Config revision、启用的 Hooks、current Build ID。
2. 获取与 Worktree 更新操作相同的独占 FD 租约；验证规范路径、入口和 cwd。
3. PythonEnvironmentResolver / NodeEnvironmentResolver 获取 Build pin；Node 额外持有 Runtime、Toolchain shared lease。
4. 再次事务读取，比较整个选择快照；变更则释放租约并重新排队。
5. 固定绝对 executable、argv、cwd、Build、source checksum、Config/Hooks/ENV，递归冻结纯数据。

不 READY 的配置在产生 MAIN 进程前失败。TS 必须在选定 Build 中包含受支持的真实 tsx 4.x CLI，realpath 必须仍位于 Build。不存在自动安装或系统 Node 回退。
