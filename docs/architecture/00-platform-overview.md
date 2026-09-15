# Git-native Script Automation / Scheduling Platform

**Phase 4.5B 已完成，Fresh Operational Schema v1 已冻结。** 平台仅接受 Fresh 安装；不支持 QingLong 数据、旧 API、ENV、CLI 或目录迁移。Phase 0–4 与 4.5A 为历史记录/实施依据，当前行为以源码及 [最终报告](../../PHASE4_5B_REPORT.md) 为准。

## 当前已实现架构

```mermaid
flowchart TD
 C[Credential] --> R[Repository]
 R --> G[Persistent Git Storage]
 G --> W[Worktree]
 W --> S[Repository-only Subscription]
 S --> D[SubscriptionDiscoveryAdapter]
 DB[DB Task projection] --> D
 D --> P[CronService publication bridge]
 P --> ST[Private stage → live scripts]
 P --> SC[Current Scheduler bridge]
 SC --> RUN[Current Runner bridge]
 ST --> RUN
 ENV[Base → Global → Repository Profile → Task Override] --> SN[Full immutable execution snapshot]
 SN --> RUN
 RUN --> LOG[Status / Logs / Notification bridges]
```

DB 是领域定义来源，Git 保存对象、refs 与工作区内容。Subscription ID 与 relative-path discovery key 决定发布身份；展示名、URL 拼写不参与。Git locks/lease、dirty/local commit 保护及发布补偿继续有效。任务子环境不继承 Backend secrets，不修改父进程环境。

## 后续边界

Task/Schedule/TaskRun 拆分、Config Assets/Hooks、Runtime、Runner v2、完整 Discovery v2 仍是后续阶段，未创建占位页面或空表。B05 已删除，B07/B03 已缩减；其余当前职责见 [桥登记](../../TEMPORARY_BRIDGES.md)。Linux 实机验收待执行已配置的 CI；本机浏览器、Fresh 全链路及重启验收通过。
