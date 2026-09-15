> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Phase 3 测试报告

最终数字及构建、浏览器结果见根目录 [PHASE3_REPORT.md](../../../PHASE3_REPORT.md)。全部测试使用 Node 22，避免宿主 Node 26 与现有依赖兼容问题；均使用临时数据库、临时 Git 仓库，没有升级运行中的数据目录。

| 测试 | 验证内容 |
| --- | --- |
| tests/phase3/migration.test.cjs | 旧 URL/Repository 记录仍 Legacy；幂等、外键和 DDL 回滚/重试 |
| tests/phase3/discovery.test.cjs | 原扫描器；JS/Python/TS/Shell、嵌套、include/exclude/dependences、Cron/new Env、autoAdd/autoDel 与无效正则 |
| tests/phase3/pipeline.test.cjs | 首次初始化、绑定、fetch、FF、无变化重试、分支切换/删除、force-push、dirty/untracked/ahead/detached/missing、凭证失效、发布失败恢复、租约互斥和符号链接拒绝 |
| tests/phase3/cron-publication.test.cjs | 系统 crontab 安装失败：Managed 严格失败，原默认行为保留 |
| tests/phase3/lease.test.cjs | 真实 Bash 超时、进程组回收、POSIX 锁可重新获取 |
| tests/phase0 与原 test | 原 clone 破坏性更新、Task/ENV/日志/状态和 API 回归 |
| tests/phase1 / phase2 | 凭证顺序/脱敏、Repository/Worktree 生命周期、跨进程锁、异常恢复、API 拒绝非法输入 |

`diagnostics/phase3/ui-smoke.cjs` 使用构建产物、Chrome、真实订阅/工作区 API、真实 Git 与 SQLite。调度传输使用测试替身，运行入口在进程内调用相同 Managed 服务；不声称浏览器启动了实际生产 gRPC 调度守护进程。覆盖创建 Managed、Repository/branch、预检、首次运行、无变化再运行、dirty 失败、工作区引用导航、编辑界面切回 Legacy。截图为 subscription.png。

`diagnostics/phase3/legacy-integrity.json` 检查 Task/ENV/依赖相关文件及原 Shell 函数未变。GitNexus 用于预编辑影响分析和 develop 比较；动态接收者、Bash 以及未跟踪新文件不能仅凭图中的零调用判断安全。
