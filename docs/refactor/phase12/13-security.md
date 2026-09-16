# Security contract

Panel-only API，沿用平台会话认证和现有请求边界，拒绝 Open 路径；写入 Joi schema 不允许未知字段。文件API没有绝对路径/任意目录参数。Git无用户可控命令字符串、shell、force/reset/clean/rebase/pull入口。

Secret边界由 canonical Worktree根、no-follow、EX lease与残留journal拒绝共同建立。Config、ENV、Credential、Notification的canonical存储在Worktree之外。执行中的临时材料不通过文件、搜索、tree、status或diff暴露。用户自己存入user.env的内容属于可编辑源码，不冒充平台Secret Store。

原子保存保护失败前原文件；乐观hash保护已发生的并发修改；EX lease串行协作消费者；Backup shared FD覆盖整个mutating操作。操作系统权限边界之外的同UID恶意进程不在承诺范围内。

公开错误仅静态code。凭据只进入原有private transport context，网络结果不向浏览器回传stderr。实际Canary审计范围、通过数量和限制见测试报告，不将静态搜索当成通用安全证明。
