> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# 失败保留与恢复

| 失败位置 | 处理 |
| --- | --- |
| 认证 / 网络 / fetch / storage 缺失 | 不进入 Worktree 发布或 Task diff；保留上一版 scripts / Task |
| dirty / conflict / ahead / diverged / detached / branch missing | 不 reset、不 clean、不 rebase；失败并保留本地内容与上一版发布 |
| 无效正则 / 不安全路径 / copy 失败 | 仅丢弃暂存目录；不触碰 live scripts 和 Task |
| Cron 参数错误 | 在发布前验证，保留上一版 |
| 发布或 Cron 注册失败 | 在原 scheduler 锁内恢复 scripts 目录与原 Task ID/定义，重新注册原定时任务 |
| 系统 crontab 安装失败 | Managed 严格抛错并恢复；原调用保留历史行为 |
| 通知失败 | 不撤销已成功发布；日志提示 |
| 用户停止 | 使用原进程停止入口；正在运行的 Managed 最近结果标记 CANCELLED / FAILED |

最近成功 commit/time 只有完成发布才更新，失败只更新最近状态、阶段和脱敏代码。Git 已更新但发布失败时，下一次仍执行完整发现，不使用“无新提交跳过”。

暂存目录位于 `data/scripts/.managed-*`，权限 0700；发布前写入 0600 的 `recovery.json`（受影响的旧 Task、目标及备份路径）。正常完成或补偿完成后清理；补偿再次失败则保留材料并报告 MANAGED_RECOVERY_REQUIRED。

**边界：** SQLite、目录 rename 和系统/gRPC 调度器没有跨系统事务。SIGKILL、断电发生在发布窗口时，不保证自动恢复或零中断；可从遗留暂存区恢复，恢复前应停止冲突订阅、核对任务定义并重新加载原调度配置。永久性文件/数据库/调度器故障也不能保证自动补偿。不能在未核对恢复材料时删除 `.managed-*`。这与 Git 失败时完全不执行 Task diff 的保证不同。进程崩溃可能留下 RUNNING 最近状态，下次运行会重置；没有引入自动修复调度器。
