# Runtime Binding

SHELL 不绑定语言环境；PYTHON 指向 PythonEnvironment；JAVASCRIPT/TYPESCRIPT 指向 NodeEnvironment。不接受 executable path、Runtime ID、venv root、node_modules root 或 Build ID。

优先级：Task explicit > Subscription default > Repository default > unbound。RuntimeDefaults 用 owner + kind 唯一约束；设置/清空默认值带 expected_version。Python/Node 未绑定时为 CONFIGURATION_REQUIRED，Shell 可以 READY。

绑定校验环境存在、不是 DELETING，readiness 还检查当前环境和 Build 健康。Build 仅用于定义期健康判断，不返回执行路径、不 pin Build。环境 promote 不修改 Task。

Environment 删除在进入 DELETING、删除文件之前检查显式 Task 与默认绑定，并由 FK 和状态 guard 处理竞态。引用诊断也显示通过默认值继承的 Tasks。

**当前 Runner 不消费新的 Runtime Binding。** UI 明示 Configured Resources；实际托管 Python/Node Task 执行在 Phase 10 激活。TypeScript Executor 同属 Phase 10。
