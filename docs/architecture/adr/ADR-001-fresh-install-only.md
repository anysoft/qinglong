# ADR-001 — Fresh Install Only

Status: Accepted design direction（Phase 4.5A；实现按阶段执行）

## Context

平台方向已由保留 QingLong 行为改为全新 Git-native 自动化平台。现核心与旧运行桥共存，不能按文件年龄判断删除安全。

## Decision

只支持全新安装、库、配置、Repository与Task。遇到非空旧QingLong库明确拒绝，不自动DROP或升级；平台自身后续版本升级仍允许。

## Consequences / implementation gate

现有21条兼容migration可折叠，但fresh bootstrap/事务失败/重启恢复必须保留。

本ADR授权文档方向，不执行生产代码清理；具体4.5B范围见[删除计划](../../../GREENFIELD_REMOVAL_PLAN.md)与[桥登记](../../../TEMPORARY_BRIDGES.md)。

## Phase 4.5B implementation outcome

本 ADR 的本阶段收敛已落实：最终 Fresh v1、Repository-only Subscription、DB 驱动 Discovery、统一 Full ENV 与旧兼容路径删除。具体验收、仍保留的桥及 Linux 限制见 [最终报告](../../../PHASE4_5B_REPORT.md)。原文的后续 Domain 目标仍按各阶段实施。
