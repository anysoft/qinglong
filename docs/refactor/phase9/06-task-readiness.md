# Task Readiness

readiness 查询时计算，与 enabled 分开。

| 状态 | 示例 |
|---|---|
| READY | 资源关系完整、可用 |
| CONFIGURATION_REQUIRED | 未配置 Source / Python 或 Node Environment |
| INVALID | Source/runtime 不匹配、跨仓库 Profile、非法 Config/Hook/Settings |
| SOURCE_MISSING | Worktree / entrypoint 不存在 |
| RESOURCE_UNAVAILABLE | 环境或 Build 不健康、Profile 禁用、Config 不可用 |

列表做批量逻辑判断；Validate 和保存执行源安全检查。source_checked 区分是否访问过文件系统。不能把列表 READY 理解为执行时永久担保；当前执行准备仍重新验证，Phase 10 再建立原子执行解析与租约。

启用要求 READY；Runtime、Profile 或默认变化会在下一次查询反映。当前调度重建和执行准备也检查 Task.enabled/readiness。
