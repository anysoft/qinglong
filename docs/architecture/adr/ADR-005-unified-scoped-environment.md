# ADR-005 — Unified Scoped Environment

Status: Accepted design direction（Phase 4.5A；实现按阶段执行）

## Context

平台方向已由保留 QingLong 行为改为全新 Git-native 自动化平台。现核心与旧运行桥共存，不能按文件年龄判断删除安全。

## Decision

Base→Global→RepositoryProfile→TaskOverride→immutable snapshot→child env，unique keys/literal values/explicit UNSET+Secret。

## Consequences / implementation gate

Phase4只统一新scope；4.5B须先补全global与所有入口才能删除env生成程序；hooks/runtime preload另退场。

本ADR授权文档方向，不执行生产代码清理；具体4.5B范围见[删除计划](../../../GREENFIELD_REMOVAL_PLAN.md)与[桥登记](../../../TEMPORARY_BRIDGES.md)。
