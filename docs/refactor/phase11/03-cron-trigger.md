# Cron Trigger

使用仓库实际安装的 cron-parser 5.4。支持五段、六段及库提供的别名；通过解析器验证，不自行解释 cron。timezone 为 IANA 名称。未指定时读取平台 SystemConfig 的 timezone，缺省沿用平台 Asia/Shanghai；保存时冻结实际值。

next_fire_at / last_fire_at 以 UTC 时间存储。修改表达式重新计算下一时间。测试固定 Clock 与 UTC 时间点，不依赖机器当地时区。

DST 遵循该解析器：America/New_York 2026-03-08 的 02:30 在 03:30 执行；2026-11-01 的 01:30 只取第一次。测试固定相应 UTC 时间并验证下一天。

SKIP 为缺省错过策略：若下一次也已到期，记录 CRON_MISFIRE_SKIPPED 并推进到当前时间之后。FIRE_ONCE 为整段积压只提交一次。没有 FIRE_ALL。
