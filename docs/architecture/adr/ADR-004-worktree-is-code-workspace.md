# ADR-004 — Worktree Is Code Workspace

Status: Accepted design direction（Phase 4.5A；实现按阶段执行）

## Context

平台方向已由保留 QingLong 行为改为全新 Git-native 自动化平台。现核心与旧运行桥共存，不能按文件年龄判断删除安全。

## Decision

Worktree是独立可编辑Workspace，按ID/原生git worktree管理；purpose只记创建来源。

## Consequences / implementation gate

引用/lease/dirty/local history决定删除保护；Task尚未直跑，scripts桥须保留到消费链替换。

本ADR授权文档方向，不执行生产代码清理；具体4.5B范围见[删除计划](../../../GREENFIELD_REMOVAL_PLAN.md)与[桥登记](../../../TEMPORARY_BRIDGES.md)。
