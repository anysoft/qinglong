# Hook Output Protocol

平台通过 `PLATFORM_HOOK_OUTPUT` 给每个 Hook 一个私有文件。空文件表示无输出。非空文件必须是 JSON；只有 BEFORE 可以提供 environment patch：

```json
{"environment":{"set":{"TOKEN":"value"},"unset":["OLD_TOKEN"],"secret":["TOKEN"]}}
```

set/unset 冲突拒绝；secret 必须引用结果中存在的变量。未知字段、无效 JSON、非法/保留 ENV 名称、NUL、超限内容均作为 Hook 失败处理。不得写 PLATFORM_*、QL_TASK_ENV_* 或 Runner bookkeeping。AFTER/FINALLY 的 environment patch 明确失败。

限制：JSON ≤64 KiB；set+unset 总项数 ≤128，secret ≤128；单值继承 ENV 的 120 KiB 上限（JSON 总限通常更早触发）；完整派生环境 ≤128 KiB。派生快照只作用于后续 BEFORE/MAIN/AFTER/FINALLY，不修改数据库各 ENV scope 或 Backend process.env。旧 `/tmp/env_PID.json` 协议已删除。

BEFORE 日志最多缓冲 4 MiB，先校验输出并注册新 Secret，再输出脱敏日志；无效输出时丢弃该 Hook 缓冲正文，只记录静态错误，避免泄露未成功注册的生成值。其他阶段按已知 Secret 流式脱敏。
