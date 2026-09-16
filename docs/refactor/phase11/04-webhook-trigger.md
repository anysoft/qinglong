# Webhook Trigger

公开入口为 `POST /hooks/<opaque UUID>`，在平台全局 body parser 与登录中间件之前注册自己的验证和 64 KiB JSON parser。Panel/Open API 不能借此提交任意 Task ID。

随机 secret 为 32 字节，数据库仅保存 SHA-256 摘要。请求只接受 Authorization Bearer；比较使用 timingSafeEqual。未知 endpoint 与错误 secret 同为 WEBHOOK_UNAUTHORIZED。query 参数拒绝；创建、克隆与轮换仅响应一次明文，普通 DTO 不含 hash/secret。

允许空 body 或 JSON，拒绝畸形 JSON、超限、压缩或不支持的内容类型。body 不进入日志、事件、ENV、arguments、Config、Hooks。可选 Idempotency-Key 限 1–200 个可见 ASCII 字符，持久化其摘要；缺省生成新的请求身份。成功接收返回 202 与 event_id/run_id。
