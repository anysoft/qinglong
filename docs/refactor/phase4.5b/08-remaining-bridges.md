# Remaining Bridges — Phase 4.5B Final

本阶段退出：**B05 Global generated ENV**。Global-only、no-ID、Python/Node/Shell/TS、Secret、UNSET、50 个同时执行与清理全部通过，已删除 generator 与旧消费路径。

本阶段缩减：**B07** 为 `SubscriptionDiscoveryAdapter`，只接收工作区、策略、私有 stage、DB 投影，输出 definition/change set/diagnostic；**B03** 只输出 system scheduler projection，不反读 Discovery 或无 ID Task。

保留 B01 scripts staging、B02 task/otask、B04 scheduler/gRPC、B06 preload 非 ENV、B08 status/stat/token、B09 dependency manager、B10 deps/dep_cache、B11 hooks/config、B12 operations、B13 SDK/notify、B14 logs、B15 Crontab 模型、B16 backup。

每项理由、消费者、替代方案和退出 Phase 以 [根登记](../../../TEMPORARY_BRIDGES.md) 为准。没有 BLOCKED_BY_PHASE10 的 ENV generator；full transport 已在有限范围实现。未开始 Phase 5。
