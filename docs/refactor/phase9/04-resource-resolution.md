# Resource Resolution

TaskResourceResolver 批量读取 Source、Worktree、Repository、Subscription、Runtime Defaults、环境健康、Profile、Config 元数据、Hook 摘要、Settings。TaskResourceValidator 提供深度源文件验证。

返回逻辑 ID、相对路径、来源层级和诊断；不返回 Runtime executable、venv/node_modules root、完整 ENV、Config Revision snapshot、Hook command snapshot、workspace lease。它不 spawn、不 materialize、不 pin Build。

ENV：Global → Repository Profile → Task override，Profile 选择遵循 Task / Subscription / Repository；跨 Repository Profile 拒绝。Config：Repository → Task ATTACH/MASK。Hooks 使用 Task-owned 四阶段定义。已有执行准备服务继续负责当前桥接快照，不能并入此 Resolver。

列表通过固定批次查询避免 N+1。1000 Task 的实测查询数见 diagnostics/phase9/list-performance.json；API 另加一次批量当前执行状态查询。

最终性能回归：1000 Task 使用 24 次批量查询，API 状态附加查询后为 25 次。健康检查跟随 Environment 的 current Build 对应 Runtime 与 Node Toolchain；不把待构建的目标 Runtime 当作当前 Build 的 Runtime，不返回 Build pin。
