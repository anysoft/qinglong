# Discovery / Task integration

编辑器保存不改 Task ID、Source 或 Runtime Binding，不执行 reconcile 或提交 Run。新增/删除/重命名提示 Discovery changes available，由用户调用绑定订阅的正式 Apply Discovery。

Phase11 identity 仍为 Subscription ID + relative-path key。同路径内容更新保持 Task ID；重命名后 reconcile 创建新身份并停用旧 Task，保留旧资源与历史。py/js/ts/sh 的发现由正式 Discovery policy 控制，不按扩展名自动绑定 Runtime。

Used by N Tasks 复用 TaskReferenceService，只有引用摘要。没有另建 Task 表或 raw-command Task，没有编辑器内自动运行和 GitUpdate Event。只有既有 ManagedSubscription 成功 Git update/reconcile 流程可以推进 Git 事件水位。
