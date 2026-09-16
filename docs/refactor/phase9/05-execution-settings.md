# Execution Settings

| 字段 | 范围 / 默认 |
|---|---|
| timeout_seconds | null 或 1–86400；null 使用平台默认 |
| max_attempts | 1–10，默认 1 |
| initial_delay_seconds | 0–3600，默认 0 |
| backoff | FIXED / EXPONENTIAL |
| concurrency | FORBID / QUEUE / ALLOW |
| notification | NONE / FAILURE / SUCCESS / ALWAYS |

这些是声明，不在本阶段实现重试、并发、通知执行。Failure 指最终重试结束后的失败。Schedule 保留 cron expression bridge，不实现 Trigger v2。

arguments 是 string[]，最多 256 项、单项 8192 bytes、合计 65536 bytes；拒绝 NUL。不执行 shell split 或 ENV interpolation，`$TOKEN` 为字面量。不要放 Secret，未来 argv 可能出现在进程列表。

当前 Shell 桥存在位置参数模式，不能安全表达所有结构化参数。非空 arguments 可以保存，但桥接执行返回 CURRENT_BRIDGE_ARGUMENTS_REQUIRE_PHASE_10，避免丢参数或错误解释。Phase 10 用原生 argv 激活。
