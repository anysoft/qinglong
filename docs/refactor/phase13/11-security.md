# Security Contract

复用现有 protected SQLite / DATA_DIR权限模型。平台原有 Credential/ENV/Config 是 plaintext at rest，没有可复用通用加密keyring；本阶段不新增crypto。Channel.secret 不进入 DTO、Outbox message、Delivery错误或日志；连接字段整体保护。管理数据库/文件系统的管理员仍能读取，不能宣称磁盘加密。

Panel auth 保护新 HTTP 与既有 SockJS；新资源拒绝 Open API token入口。Run路径由ID构造，拒绝 symlink、用户路径、raw日志分支和换inode cursor。Run日志沿用写入时完整脱敏，API不提供旁路。

通知消息只取安全Run metadata，不取 Task Secret ENV、Webhook payload、Config内容或Hook命令。adapter捕获错误只映射静态code，旧通知桥也不再打印原始provider异常。

WEBHOOK 只允许 http/https、无userinfo、URL≤4096、10秒超时、64KiB响应、禁止redirect。**Notification Webhook拥有平台网络访问能力**，允许管理员选择私网接收器，不宣称完全阻断SSRF。Channel管理是高信任Panel操作。

日志脱敏覆盖平台注册及Hook派生Secret，不承诺发现脚本自行硬编码、平台从未知晓的任意秘密。官方浏览器验收对ENV/Config/Hook/Channel canary执行HTTP和WebSocket审计。
