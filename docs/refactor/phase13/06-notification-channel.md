# Notification Channels

独立资源：name/type/enabled/is_default/version、non_secret_config、protected secret、archive、timestamps。所有 connection fields 均保守作为 secret 保存，公开配置当前为 {}。Task 只关联 channel_id，不保存通知凭据。

25 种：新增结构化 WEBHOOK；保留 gotify、goCqHttpBot、serverChan、pushDeer、chat、bark、telegramBot、dingtalkBot、weWorkBot、weWorkApp、aibotk、iGot、pushPlus、wePlusBot、email、pushMe、webhook（旧模板协议）、lark、chronocat、ntfy、wxPusherBot、wxPusherSpt、openiLink、wpush。

NotificationChannels.save 统一校验必填配置，send 为每次 delivery 创建独立旧适配器实例，传入有界 transport，无共享 title/content/params 污染或全局配置回退。23 个 HTTP provider 和 SMTP 经真实本地接收器验证；目的主机改为 fixture，原 payload / success parsing 保留。额外验证 multipart。

API GET/POST/PATCH/DELETE /api/notification-channels，PATCH 需 expected_version。secret_action 为 KEEP/REPLACE/DELETE。GET 永不返回 secret，只返回 secret_configured。Archive 禁用并清掉凭据，保留历史 FK，pending delivery 可转 DEAD / CHANNEL_DISABLED。

POST :id/test 持久化 TEST，消息明确 This is a test notification，返回 Outbox identity；异步结果在 Deliveries。email 保留 emailService，也支持显式 emailHost/emailPort/emailSecure。

旧 Settings 通知入口已换成 Channels UI；旧 User notification GET 只提示正式入口，旧配置写接口返回410。登录与显式脚本通知 SDK 的旧 Auths 配置仍保留为 B13，非 Task 完成通知路径。

新装向导移除旧通知表单：先创建账户，登录后从Notifications配置正式Channel。Settings不再读取旧User notification DTO。
