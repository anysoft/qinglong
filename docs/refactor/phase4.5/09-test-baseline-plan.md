# Test Baseline Reset Plan

当前全部 78 个测试文件及每个声明标题见 [test inventory](../../../diagnostics/phase4.5/test-inventory.md) / test-cases.json。模板参数生成多个用例，声明数不是运行测试计数。此阶段不删测试、不重写断言、不运行有安装/服务副作用的套件。

Phase 4 历史运行结果为 298 passed / 0 failed / 3 skipped；这是前序证据，不冒称 4.5A 重新执行。前端生产 build 曾通过，但独立 tsc 的 65 条既存问题必须继续记录；fresh-only 不允许通过删检查掩盖错误。

## 分类与归档

- PLATFORM CORE：安全认证/2FA/路径防护/secret、Git identity/worktree/locks/恢复、HTTP listen、日志 drain/UTF8、stop/claim race、统计/retention。这些源于旧项目仍应保留。
- LEGACY REGRESSION：破坏性 reclone、ql raw 参数、旧 cwd/log 文本、crontab import；仅在替代职责完成后归档。
- COMPATIBILITY：旧库补列/NULL、convert/mode fallback、Global 重名 & /JS 模板/trim、plaintext login migration、410 redirect contract；4.5B 重置基线后归档对应 case。
- TEMPORARY BRIDGE：task.sh、status/stat HTTP、preload、全局依赖、scheduler RPC/crond projection、staging；bridge 留多久测试就留多久。
- ARCHIVE：历史 tests/phase0 中破坏性 clone 和旧行为“应成功” characterization 在新基线切换后转只读历史，不再约束新产品；现在尚不归档。

混合文件必须拆 case：auth-security/user-security 保留 JWT/scrypt/2FA、去旧 plaintext；resources 保留 credentials/identity、去 conversion/fallback/collision；domain/migration 保留事务/FK、去 Phase upgrade ledger 固定计数；phase3 pipeline 保留失败保护/dirty/lease/retry，去切回 Legacy；phase4 transport 保留私有权限/清理/大小，去无 scopes 必须不创建 snapshot 的兼容断言。

## 新平台最低 release baseline

| 领域 | 必测 Gate |
| --- | --- |
| Fresh install | 空 data 目录、配置缺失错误、admin 一次性初始化、version=1、重复启动、非空旧库拒绝；无 ql repo 启动副作用 |
| Credential | 可复用、keep/replace、匿名/disabled/transport、host 校验、secret 不入响应/log/argv |
| Repository | normalized identity、bare persistent、fetch/prune、delete ref protection、缺失/局部失败恢复 |
| Worktree | branch/tag/commit 创建、FF-only、dirty/ignored/ahead/diverged、双向 .git 检查、lease |
| Subscription | Repository required、ref/默认 branch、首次/无变更 sync、跨仓库与共享工作区、失败保留 |
| Discovery | 嵌套/筛选/无 metadata、稳定 source key、仅 owned tasks、无源码执行、copy bridge 失败回滚 |
| ENV | Global/Profile/Task unique、UNSET/disabled/empty、完整 map、三语言一致、global-only/no-ID editor、Secret mask |
| Task bridge | Python/Node/Shell 实际运行、cwd/args、start/stop/exit/timeout、hooks 保留边界 |
| Scheduler bridge | manual/node/system、restart/reconcile/DB truth、RPC timeout 不重放、锁与队列 claim |
| Security | auth/scopes/file traversal/symlink/SQL+Shell payload/error redaction，旧入口不存在与 internal IPC 受限 |
| Concurrency | 并发 env≥50（注明并发度）、同repo冲突、不同repo独立、owner crash、Run cancel |
| UI/build | 已实现 IA 操作、secret response、base URL、backend/front build；历史 type debt 单列 |

4.5B 先建立新 baseline 再归档旧断言。每删除一类测试必须提供替代 coverage 或明确“该能力已从产品删除”的条目；不把 298 当不可变数字，也不允许仅通过减少用例获得绿色。Linux crond/flock 和容器 empty-volume 验证是发布 gate，不以本次静态审计代替。
