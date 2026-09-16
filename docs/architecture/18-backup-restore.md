# Backup / Restore / Disaster Recovery

> Phase15 convergence: schema v9 remains unchanged. The current cross-domain ownership, physical bridge removals and operations contract are in [Platform overview](00-platform-overview.md) and [Platform operations](20-platform-operations.md). Earlier bridge-retention statements below are historical. Hosted Linux qualification is a separate gate in [Phase15](../../PHASE15_REPORT.md).

Schema v9。Backup/Restore 不引入第二套 Task、Runtime、Notification 或迁移引擎。

```mermaid
flowchart TD
    A[运行平台] --> Q[QUIESCING: 停 producer / drain queue]
    Q --> L[排他 Backup FD lease]
    L --> D[SQLite VACUUM INTO]
    L --> G[Git / Worktrees / Config / Logs / 用户数据]
    D --> M[不可变 manifest + NDJSON inventory]
    G --> M
    M --> V[完整校验]
    V --> R[原子发布 READY snapshot]
    R --> E[流式 archive + AES-GCM 加密导出]
```

```mermaid
flowchart TD
    E[加密文件] --> A[认证 / 解密]
    A --> U[安全解包至隔离目录]
    U --> V[Snapshot Validator]
    V --> P[显式 Stage / RESTORE_PENDING]
    P --> L[停止后端 / backend.lock]
    L --> C[Candidate DATA_DIR]
    C --> M[Canonical schema migration]
    M --> G[Git repair + Runtime reconciliation]
    G --> S[Pre-restore safety snapshot]
    S --> X[同文件系统 rename 切换]
    X --> F[最终 Git / DB / Config 校验]
    F -->|成功| O[COMPLETE: 正常启动]
    F -->|失败| B[保留失败候选 / 回滚 / Recovery Required]
    O --> Y[显式 Runtime → Toolchain → Environment rebuild]
    Y --> T[Task READY / Trigger / Notification 复验]
```

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> CANCELLED
    PENDING --> PREPARING
    PREPARING --> PREPARED
    PREPARED --> OLD_ROOT_MOVED
    OLD_ROOT_MOVED --> CANDIDATE_PUBLISHED
    CANDIDATE_PUBLISHED --> VALIDATING
    VALIDATING --> COMPLETE
    VALIDATING --> ROLLED_BACK
```

任何阶段中断由启动 bootstrap 读取外置 journal，用 ID 派生路径、SHA256 和 dev/ino 识别继续/回滚条件；不凭原绝对路径、PID 或目录名猜测。未知状态失败关闭，保留数据供修复。

文件日志延后到恢复完成和私有数据库准备之后启用，避免模块导入在离线切换前创建 DATA_DIR。primary / workers / 托管进程继承租约，正常业务启动不越过待恢复 journal。

生产契约、格式、安全界限和操作步骤见 [Phase 14 文档](../refactor/phase14/03-backup-coordinator.md)。实测结论见 [最终事实报告](../../PHASE14_REPORT.md)。
