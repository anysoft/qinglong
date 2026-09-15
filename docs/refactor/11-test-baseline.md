> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Test Baseline / 可复现运行

> Phase 0 历史快照：本文记录重构前基线。当前代码已新增 GitCredential / Repository、可空订阅引用及兼容适配器；现状增量、测试和限制见 [Phase 1 报告](../../PHASE1_REPORT.md)。旧执行管线保持基线行为。

## 运行结果

基线 commit：4eb27427f809b565202f0b1bfa8129073f3fe5bd。主机 macOS arm64；宿主 Node 26.3.1；完整既有套件以隔离 Node 22 重跑。仅安装锁定开发依赖和 SQLite 对应平台二进制，不修改package.json/lockfile。

| 运行 | 结果 | 说明 |
|---|---|---|
| 宿主直接 npm test（初次） | 101 pass / 48 fail / 3 skipped | 缺root .env及sqlite本地binding；不能作为产品回归结论 |
| 宿主Node26 + 临时配置 | 159 pass / 7 fail / 3 skipped | 4个安全测试文件受SlowBuffer依赖错误；3个ql log测试受测试环境QL_DATA_DIR继承影响 |
| Node22 + 修正隔离配置，既有 npm test | **176 pass / 0 fail / 3 skipped**（179 tests） | QL_DIR为临时根，QL_DATA_DIR清空，让各test自己的QL_DIR覆盖有效；无production改动 |
| Node22，Phase0新基线 | **17 pass / 0 fail / 0 skipped** | 真实本地Git、Shell、语言进程、SQLite；特定外部边界用fake实现 |

3项skip是 `test/back/node-path-lock.test.cjs` 的跨进程flock测试：simultaneous cold/expired refresh、different configuration waiters、lock timeout fallback；当前macOS无flock。Linux仍需执行，不将skip计作pass。

## 安装 / 命令

在仓库根运行：

```sh
npx --yes pnpm@8.3.1 install --frozen-lockfile --ignore-scripts
# 仅在 sqlite3 native binding 未安装时，执行其自己的安装生命周期：
npm --prefix node_modules/sqlite3 run install
npx --yes --package=node@22 -c 'node diagnostics/phase0/run-tests.cjs existing'
npx --yes --package=node@22 -c 'node diagnostics/phase0/run-tests.cjs baseline'
python3 diagnostics/phase0/inventory.py
```

如果已有兼容Node22，可直接 `node diagnostics/phase0/run-tests.cjs existing` / `baseline`，避免临时下载runtime。runner创建并清理临时QL_DIR、空测试.env、data子目录和Shell/sample副本；不启动应用服务，不修改HOME，不访问真实数据。最大等待180秒，输出保留原测试报告。

`--ignore-scripts` 避免安装时执行应用初始化；sqlite install是依赖原有生命周期，作用仅限node_modules native binding。没有升级锁文件。Node22运行是兼容验证环境，不是对运行生产版本的升级建议。

## 已有测试范围

仓库 `test/back/*.test.cjs`、`test/front/*.test.cjs`：鉴权/用户/2FA/HTTP/SockJS安全、文件路径与黑名单、Cron validation、调度readiness/reconciliation/注册回滚/跨进程锁、手工执行claim/stop竞态/child close、日志读取/命名、dependency cache状态、数据库迁移备份、统计/retention、PM2/build provenance、前端HTTP错误。package.json原test script保持不动。

## 新增测试与边界

| 文件 | cases | 真正调用 / 边界 |
|---|---|---|
| tests/phase0/shell-baseline.test.cjs | 10 | 从生产Shell提取函数（无算法改写）执行git_clone/update_repo/scanner/add_cron；临时file://origin；5种dirty状态；branch双clone；复制完整task.sh/share/otask/preload执行Python/Node/Shell |
| tests/phase0/service-baseline.test.cjs | 6 | 调用真实EnvService.set_envs（DB读取/写文件为fake，生成内容实际在JS/Python/Bash执行）；formatCommand；dependency命令生成；真实node-schedule触发ScheduleService.runTask及真实child stdout/stderr |
| tests/phase0/database-baseline.test.cjs | 1 | 实际Sequelize九模型、SQLite :memory:，真实表名/无FK、同表自动/手工task、CronService.status写RunningInstances exit7/error |

Git/scanner测试只替换通知、proxy设置和add/del API为捕获边界；**自动创建的HTTP→DB完整链路未在一个进程端到端接通**。DB测试另验证真实model和状态落库，不能把二者合称全栈E2E。三语言执行替换临时副本的状态/通知client，真正执行task.sh/preload和fixture，但不启动HTTP/gRPC面板。

Characterization：nested basename cron fallback；ENV JS模板求值；Shell trim与JS保留空格；现有凭证嵌入command。测试通过不代表这些设计安全或理想。

## 仍未覆盖 / 后续验证方法

- 实际系统crond、cron重启/停机补跑、system模式timeout/kill：隔离Linux容器+临时data。
- 实际UI点击、HTTP订阅clone到自动入库整链、raw下载和SSH/API token：本地fake HTTP/SSH服务，不用公网secret。
- Node TS/MJS完整package解析和Python真实venv/多版本：仅记录当前能力边界；用镜像矩阵补验，不能在Phase0实现新runtime。
- 依赖真实安装/冲突/清理同时运行：离线wheel/npm tarball + 隔离prefix。
- 最终退出码API故障/强杀和hook异常全排列，repo同目录竞态，symlink/path traversal HTTP可达性，真实通知provider。
- GitNexus工具图/impact与detect_changes未运行（工具和本地skill缺失）。无既有符号变更、无commit，不能伪造工具结果。
