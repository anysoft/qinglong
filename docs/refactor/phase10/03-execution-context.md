# Phase 10 — 不可变 ExecutionContext

Context 包含 identity、source、runtime、args、environmentSnapshot、configSnapshot、hookSnapshot、settings、workspace、secretValues。所有字段是 JSON 可复制的纯数据并递归 Object.freeze；可变 FD、句柄、redactor、取消状态放在 Context 外。

一个 TaskRun 只解析一次；重试和 backoff 保持同一个 Context 及租约。每次 Attempt 从相同 ENV 起点创建新的 Hook patch 环境，避免前次 BEFORE 修改残留；redactor 则跨 Attempt 复用以记住已经见过的 Secret。

数据库只保存脱敏 metadata：Task version、资源 ID、Build/Revision ID、source checksum、dependency hash、Config revision 和 Hook version。完整环境、Secret、Config 内容、Hook command 不进入 TaskRun/Attempt。Context 是进程内快照；重启后中断运行标记 INTERRUPTED，不反序列化旧快照继续执行。
