# ADR-002 — No QingLong Compatibility

Status: Accepted design direction（Phase 4.5A；实现按阶段执行）

## Context

平台方向已由保留 QingLong 行为改为全新 Git-native 自动化平台。现核心与旧运行桥共存，不能按文件年龄判断删除安全。

## Decision

不新增QingLong数据库/API/Filesystem/ENV/Subscription/Dependency/CLI兼容。Phase0–4契约仅作历史证据。

## Consequences / implementation gate

移除兼容义务不等于删除仍在提供运行能力的实现；按consumer+replacement gate退出。

本ADR授权文档方向，不执行生产代码清理；具体4.5B范围见[删除计划](../../../GREENFIELD_REMOVAL_PLAN.md)与[桥登记](../../../TEMPORARY_BRIDGES.md)。
