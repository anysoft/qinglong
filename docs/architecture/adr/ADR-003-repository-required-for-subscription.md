# ADR-003 — Repository Required For Subscription

Status: Accepted design direction（Phase 4.5A；实现按阶段执行）

## Context

平台方向已由保留 QingLong 行为改为全新 Git-native 自动化平台。现核心与旧运行桥共存，不能按文件年龄判断删除安全。

## Decision

Subscription必须关联Repository，远端和credential由Repository持有，删URL/raw/内嵌凭据与subscription override。

## Consequences / implementation gate

worktree_id可在未准备状态为空；禁止用该生命周期NULL恢复URL-only模式。

本ADR授权文档方向，不执行生产代码清理；具体4.5B范围见[删除计划](../../../GREENFIELD_REMOVAL_PLAN.md)与[桥登记](../../../TEMPORARY_BRIDGES.md)。
