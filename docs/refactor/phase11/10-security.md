# Security Boundaries

- Webhook secret 高熵、摘要存储、恒时比较、轮换，普通 DTO 不含摘要。
- 认证先于 body 解析与事件写入；未知/错误 secret 不产生数据库事件。
- JSON 64 KiB 上限；请求体从不进入执行输入、持久化或日志。
- Panel CRUD 拒绝未知字段和 /open 会话；乐观版本防止覆盖。
- 路径限定相对 glob；扫描不跟随符号链接，Git diff 只用固定 argv。
- Trigger 只提交 Task ID 和 Event identity；不接触 Secret ENV、Config 内容、绝对解释器或 Runner。
- Task 禁用、Trigger 禁用、资源未就绪只产生诊断 SKIPPED；并发仍由 ExecutionService 判定。
- Git / Worktree / runtime 现有锁、所有权和删除保护保留；本阶段不删除用户目录。
