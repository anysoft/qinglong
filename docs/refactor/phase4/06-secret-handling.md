# Secret Handling

Secret 必须显式 is_secret=true，不根据 TOKEN/PASSWORD 等变量名猜测。SQLite 和备份仍是明文存储：**At-rest encryption remains a future security improvement.** 没有引入自制加密。

新变量 ORM 默认 scope 排除 value，服务内部显式 unscoped 读取后转换 Public DTO。API Secret 返回 has_value/is_secret、value=null、display=********。UI 从不获取原文再遮罩，不提供 Secret 明文复制或导出。

编辑：省略 value 保留现有值；replace_secret=true + value 才替换已存在的 Secret；clear=true 删除 entry。掩码字符串不能作为密码保存。原 Secret 不允许直接降级为 Plain，以免 metadata 编辑意外暴露；可明确删除后重新创建。空字符串是合法新值。

克隆在后端事务内复制，响应仍经过公开 DTO。错误均使用固定代码，不回显 Joi/SQL/spawn 原始异常。新命名空间的 JSON parser 错误也单独脱敏，避免非法 JSON 错误引用请求中的 Secret。旧 /api/envs 与 /open/envs 不改变 response contract。

日志只记录操作、scope、owner/profile ID、数量与结果。快照不写进 RunningInstances，也不计算可攻击低熵 Secret 的裸 hash。进程输出过滤支持原文、JSON 转义、URL/base64、账号拆分值；用户自行写文件、向网络发送或任意重新编码 Secret 不属于进程输出过滤的隔离保证。Task 本身不是沙箱，同 UID/管理员进程仍具有系统访问权限。

临时 Secret 目录 0700、文件 0600；正常退出清理，崩溃由后续安全清理回收。共享 Global 文件继续原机制，不声称修复历史 Global 的存储权限或模板执行风险。
