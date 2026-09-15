# Phase 5 测试与复现

最终计数、构建与限制见 [PHASE5_REPORT.md](../../../PHASE5_REPORT.md)。发布入口仍是 `tests/platform/run.cjs`，所有新测试都在 `tests/platform/test-baseline.json` 显式分类；未通过归档或跳过来隐藏 Phase 5 回归。

| 文件 | 覆盖 |
| --- | --- |
| schema.test.cjs | 冻结 v1、Fresh/迁移签名一致、数据/命令保留、早期及 DROP COLUMN 后失败回滚、未知库拒绝 |
| domain.test.cjs | 不可变/原子 revision、并发编辑、Secret metadata、保留孤儿内容、Repository/Task override/MASK、引用与级联、Hook reorder |
| materialization.test.cjs | COPY/SYMLINK、只读/临时可写、冲突、原字节/mode 恢复、路径/特殊文件/Unicode、故障恢复、未知文件保护、篡改 journal 根边界 |
| hook-output.test.cjs | set/unset/secret、仅 BEFORE、父进程不变、无效/超限输出、原型属性拒绝、跨 chunk UTF-8 脱敏 |
| runtime.test.cjs | 真实三语言、四阶段顺序、失败策略、主/Hook 超时、子进程组、两种日志模式取消、真实 SIGKILL、并发/BUSY、运行中修改三类快照、Node runCron/system command/manual 一致 |
| api.test.cjs | 资产/Hook/绑定 API、Secret GET 拒绝、所有 metadata/preview 无正文、错误脱敏 |
| script-access.test.cjs | Script 内容访问互斥、遗留 journal 拒绝、Node 在 helper 退出后继续持锁、动作/响应结束后释放 |
| process-group.test.cjs | 真实 zombie 进程组、Darwin EPERM、活进程/未知状态/检查失败 fail-closed、Linux 权限错误保留 |
| publication-integrity.test.cjs | 订阅失败补偿不丢失 Task ENV/Config/Hooks；成功删除才级联 |

已有安全、Credential、Git、Worktree、Subscription、调度/取消、ENV、账号模式、50 个同时运行 snapshot 等发布测试继续执行。旧 full-ENV transport 测试通过测试专用 snapshot-main adapter 调用现行 HookLifecycle/MAIN，保持其隔离断言；完整 ID→SQLite→准备→租约路径另外通过真实运行和浏览器测试覆盖。

```sh
pnpm build:back
pnpm test
pnpm build:front
node diagnostics/phase5/check-typecheck.cjs
node diagnostics/phase5/static-audit.cjs
QL_BROWSER_RUNTIME=/path/to/isolated/node_modules pnpm test:platform:e2e
```

环境：Node 22、pnpm 8.3.1。当前 macOS 使用系统 Chrome；Ubuntu workflow 安装 isolated Playwright/Chromium。浏览器从空 DATA_DIR 安装、登录，经 SSH Credential、Repository、Subscription 同步发现三语言 Task，真实 UI 创建 ENV/Config/revisions/bindings/override/MASK/Hooks，运行并读日志，重启再执行。检查 HTTP 与 WebSocket 消息，并验证运行中 Script 读取/下载拒绝访问注入副本。

类型预算冻结为进入 Phase 5 的 54 条既有诊断，按文件/诊断内容计数；新增错误即失败，保留完整 tsc 原始退出码。Linux 当前没有可用本地容器主机，Linux 锁/权限/原子安装/崩溃路径已纳入 Ubuntu CI；实际结果仍为 PARTIAL — CI pending。
