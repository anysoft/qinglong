# Phase 4 Test Report

使用 Node 22、macOS、临时 SQLite、本地 Git、实际 Bash/Node/Python 和 Chrome。宿主 Node 26 与历史依赖不兼容，沿前序验证环境。没有部署、升级线上数据库或修改真实仓库数据。

最终计数和结果见根目录 [PHASE4_REPORT.md](../../../PHASE4_REPORT.md) 及 diagnostics/phase4/verification.json。

| 测试文件 | 验证 |
| --- | --- |
| legacy-characterization | 改执行前的三语言重复/disabled/空格/模板实测 |
| domain | CRUD/clone/default/删除保护、Secret keep/replace/clear、事务回滚、Profile 优先级、UNSET/disabled/empty、冻结结果 |
| execution | 三语言复杂值与注入样例、输出脱敏、文件权限、50 次并发独立快照 |
| isolation | 同仓库不同 Profile、跨仓库、Task override、下一次无配置无残留；非法 JSON 不回显 |
| account-mode | Shell/Node/Python conc 账号拆分及私有临时日志 |
| entrypoint | 实际 ID → 文件 SQLite → 内部 helper → task.sh；自动清理、disabled 失败 |
| api | 实际 HTTP CRUD/Preview、Secret-safe 错误、scope 校验、/open 拒绝 |
| redaction | 分块 UTF-8/emoji、正则字符、多行 Secret 和 JSON 转义输出 |
| migration | Phase 3 升级、NULL 默认、旧行保留、幂等、故障回滚、EXPLAIN 索引 |
| transport | owner 活跃/失效清理、symlink 拒绝、大小限制、无配置不创建快照 |
| repository-deletion | 有 Profile 时先阻止存储删除；DELETING 状态拒绝新 Profile |

复现：

```sh
npx --yes --package=node@22 -c 'npm run build:back'
npx --yes --package=node@22 -c 'node --test --test-concurrency=1 tests/phase4/*.test.cjs'
npx --yes --package=node@22 -c 'node diagnostics/phase0/run-tests.cjs existing'
npx --yes --package=node@22 -c 'node diagnostics/phase0/run-tests.cjs baseline'
npx --yes --package=node@22 -c 'node --test --test-concurrency=1 tests/phase1/*.test.cjs tests/phase2/*.test.cjs tests/phase3/*.test.cjs'
npx --yes --package=node@22 -c 'npm run build:front'
PLAYWRIGHT_MODULE=/path/to/playwright npx --yes --package=node@22 -c 'node diagnostics/phase4/ui-smoke.cjs'
```

Chrome 使用构建产物和实际 Scoped API/services/SQLite。实际订阅编辑器选择 Profile；Task 管理页编辑覆盖/UNSET/继承/显式 Profile/Preview。测试调度桥调用同一 Resolver/Transport 后执行真实 task.sh，分别验证三语言。没有宣称启动生产 gRPC/crond 守护进程；另有 entrypoint 测试覆盖系统 cron 会经过的 Shell ID 入口。

UI 响应体和脚本输出均检查测试 Secret 不出现，disabled Profile 明确失败。原有三个 flock skip 保留；完整 Linux 容器/原生系统定时调度矩阵不在本机认证范围。50 次并发测试按每批 10 个执行限制宿主进程压力，仍同时运行不同独立快照，不把顺序运行宣称并发。
