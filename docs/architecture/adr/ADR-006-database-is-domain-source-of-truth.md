# ADR-006 — Database Is Domain Source Of Truth

Status: Accepted design direction（Phase 4.5A；实现按阶段执行）

## Context

平台方向已由保留 QingLong 行为改为全新 Git-native 自动化平台。现核心与旧运行桥共存，不能按文件年龄判断删除安全。

## Decision

DB存定义、绑定和运行事实；scheduler/crontab文件为投影，scanner不得反读文本作为Task真相。Git内容/refs仍由Git权威。

## Consequences / implementation gate

4.5B改Managed scanner输入为DB投影；system crontab输出可暂留，不实现新Scheduler。

本ADR授权文档方向，不执行生产代码清理；具体4.5B范围见[删除计划](../../../GREENFIELD_REMOVAL_PLAN.md)与[桥登记](../../../TEMPORARY_BRIDGES.md)。

## Phase 4.5B implementation outcome

本 ADR 的本阶段收敛已落实：最终 Fresh v1、Repository-only Subscription、DB 驱动 Discovery、统一 Full ENV 与旧兼容路径删除。具体验收、仍保留的桥及 Linux 限制见 [最终报告](../../../PHASE4_5B_REPORT.md)。原文的后续 Domain 目标仍按各阶段实施。
