# Phase 12 Status: PARTIAL

Code Workspace + Git Editor：**本机功能与回归 PASS；唯一待验项为 Linux Qualification（Phase15）**。

验收完成于 2026-09-16，Darwin arm64。机器可读结果见 `diagnostics/phase12/final-gates.json`。

## 实现与边界

Workspace identity 就是 **Worktree ID**，不新增 Workspace 表、会话表或草稿表。Schema 保持 **v9**。文件直接属于登记的 canonical Worktree，沿用 RepositoryPathResolver、RepositoryStorage 与 Worktree 注册校验，因此本地提交、dirty、untracked 自动进入 Phase14 快照范围。

入口为 Repository / Worktree → Open Workspace，或导航 Code Workspace。请求只接收 Worktree ID 与相对路径，响应不包含宿主绝对路径。编辑器复用既有 Monaco，支持语言高亮、行号、查找替换、多标签、dirty 标记、保存与关闭确认；切换 Worktree、离开页面和关闭窗口保护未保存草稿。小屏 Git 面板使用 Drawer。

### 文件与安全契约

- 拒绝 POSIX/Windows/UNC 绝对路径、反斜线、空路径段、`.`、`..`、NUL/control、`.git` 及平台执行/编辑临时名称；逐级检查祖先目录。
- `tmp/cache/venv/node_modules` 不因名称被判为平台所有。平台实际 Config materialization / Node binding journal 尚存时，整个 Workspace fail closed，交由 Execution recovery 清理。
- symlink 只展示自身 metadata；安全相对 target 可显示，外部/绝对 target 只显示 `UNSAFE_SYMLINK`，不暴露目标。拒绝通过链接访问目标、特殊文件及多硬链接普通文件。
- 文件内容严格按 UTF-8 解码，NUL/无效编码只返回 binary metadata。编辑上限 **2 MiB**，文本查看上限 **10 MiB**。保存保留 BOM、LF/CRLF 和原 mode；新文件 UTF-8/LF/0644，不自动赋予 `.sh` 执行权限。
- Save 必须携带 SHA-256 expected hash；写入前和发布前重新检查。外部修改返回 `WORKSPACE_FILE_CONFLICT`，UI 只提供 Reload / Cancel。
- 同目录私有临时文件写入、chmod、fsync 后原子 rename，再 fsync 父目录。临时回滚副本保证发布后的 fsync 失败可恢复原内容与权限，正常完成立即删除；回滚自身失败保留原副本并返回 `WORKSPACE_RECOVERY_REQUIRED`。不产生持久 `data/bak` 编辑副本。
- Create 采用排他创建；Rename/Move 使用操作系统 no-replace rename，目标必须不存在；Delete/Rename 检查 source hash/identity；目录仅允许删除空目录。不能删除或重命名 Worktree 根。

同 UID 恶意文件系统写入者不是本模块的 OS sandbox 边界。外部编辑器的普通修改由 optimistic hash 检测，平台内部并发由共享锁域约束。

### 锁、执行与备份

所有文件/Git mutation 持 **Phase14 platform shared mutation lease + 原有 Repository/Worktree EX lease**，没有 editor.lock。Git 与固定 rename helper 继承平台/Worktree FD，监督器收敛子进程后释放。

Execution、Git Sync 或另一编辑进程占用时拒绝 mutation。竞争发生在 Repository 层时为 `REPOSITORY_BUSY`，Worktree 层为 `WORKTREE_BUSY`。第一版读取也采用保守 EX lease，运行期间暂不能浏览文件，防止临时 Secret Config/Node binding 曝光。只读失败不修改 Worktree 生命周期。

Backup QUIESCING 拒绝新 mutation，并等待已接收的 editor 操作完成后获得排他快照。RESTORE_PENDING 阻止 Save/Create/Delete/Commit/Push，包括直接 service 调用。全局 Git identity 只修改已有 System Settings，持 platform shared lease。

### Git 契约

Git 使用现有 GitCommandService、Credential resolver 和固定 argv；禁用 hooks、fsmonitor、外部 diff/textconv，采用 literal pathspec 和 `--` 分隔。没有 shell 拼接、force push、pull、reset hard、clean、branch switch、rebase 或原始命令入口。

- Status 使用稳定 porcelain v1 `-z`，复用原 parser；覆盖 M/A/D/R/??、staged/unstaged/conflict，路径再次校验并分页。
- Working/staged diff 最多 **256 KiB / 4,000 行**，明确 `truncated`；binary 显示 metadata。监督器持续排空输出而不无限累积。
- Stage/Unstage 为选定路径级操作，正确处理删除、特殊名称、前导 dash、literal wildcard；unborn 分支撤销暂存保留磁盘文件。
- Commit 再读当前 status，只提交 staged，拒绝冲突/空暂存和无 identity。消息非空、最多 8,192 字节、拒绝 NUL，支持 Unicode/多行。显式 name/email 保存在 System Settings，调用级 `-c` 注入，不使用或修改宿主全局身份，不签名。Commit 返回 SHA/summary，**不自动 Push**。
- Push 是独立确认操作，要求现有 Credential 的 WRITE capability。只推当前分支到已知 origin/upstream；无 upstream 时要求明确目标 branch 并 `check-ref-format`。核对 origin push URL 与正式 Repository URL 相同。认证、网络、non-fast-forward 返回静态码，不回传 raw stderr/凭据。

### Task、Discovery 与 Trigger

Workspace 显示 Used by N Tasks；Save 不提交 TaskRun，不执行 editor buffer。创建 `.py/.js/.ts/.sh` 后可通过已有 Apply Discovery 流程生成正式 Task。编辑同一路径保持 Task ID；rename 经正式 reconcile 后新路径形成新 identity、旧 Task 禁用。

Commit/Push 不合成 GitUpdate Event；只有正式 Subscription Sync 处理实际远端更新时才进入既有 GitUpdate → TaskRun 链路。Workspace 的 Sync 和 Apply Discovery 按钮调用原 API，无独立 fetch/reset pipeline。

## Legacy / Bridge 审计结论

| Consumer | 最终处置 |
|---|---|
| 原 Script Page、编辑/重命名/保存组件 | 删除实现；旧路由仅链接 Code Workspace |
| ScriptService | 物理删除；不存在新 Workspace 消费者 |
| `/api/script` | 保留静态 410 `CODE_WORKSPACE_REQUIRED` tombstone；任何方法均不访问文件 |
| 单文件 `data/bak` 写副本 | 随旧 Editor 退出；不删除磁盘已有用户文件 |
| Subscription staging/publication | Phase11 已退出，不恢复 |
| Execution / Discovery staging | 已由正式 Worktree 消费替代 |
| B01 | Editor responsibility **REMOVED** |
| B13 / B17 | SDK/bootstrap 与 disabled Task source recovery 的独立剩余职责保留 |
| B14 | compatibility log 职责不变 |
| B16 | Phase14 Backup/Restore 保持；真实不同 DATA_DIR 恢复回归覆盖新编辑状态 |

## 验收矩阵

| Item | Status |
|---|---|
| Workspace Domain | PASS |
| File Tree | PASS |
| File Read | PASS |
| File Edit | PASS |
| Atomic Save | PASS |
| Optimistic Conflict | PASS |
| Create / Rename / Delete | PASS |
| Path Security | PASS |
| Worktree Lease Integration | PASS |
| Backup Barrier Integration | PASS |
| Git Status | PASS |
| Git Diff | PASS |
| Git Stage / Unstage | PASS |
| Git Commit | PASS |
| Git Push | PASS |
| Search | PASS |
| Task / Discovery Integration | PASS |
| Backup / Restore Regression | PASS |
| Legacy Editor Removal | PASS |
| API / UI | PASS |
| Browser E2E | PASS |
| Scale | PASS |
| Platform Regression | PASS |
| Linux Validation | PARTIAL — Phase15 |

## 构建与回归结果

- 正式平台套件：**458 tests / 455 passed / 0 failed / 3 skipped**，约196秒；原438项覆盖完整保留，新增19项Workspace测试及1项旧服务退休断言。
- Backend build、Frontend build：**PASS**。前端仍提示既有大bundle警告，本阶段复用Monaco且未新增依赖。
- Typecheck regression：**PASS，0 new**；历史错误从32减至22，原始tsc exit仍为2，不声称全项目类型检查清零。
- 真实Managed Runtime离线环境/租约回归：**3/3 PASS**（Python venv/pip、Node npm/pnpm快照/脚本策略及进程恢复）。
- 真实Runner执行回归：**2/2 PASS**。CPython3.13.15固定venv import、Build promotion期间重试快照、定时/超时/取消；Node24.21.0的CJS/ESM与tsx4.20.6 TypeScript、定时、超时/取消、binding恢复与冲突拒绝。
- Python官方源码首次下载过慢，终止该下载后使用HTTPS Range取得完整源码并核对固定SHA-256，通过正式RuntimeOperations移除失败安装再重装成功；没有用host Python替代Managed Runtime。
- 一次并发验收运行曾在旧Cron规模测试的清理hook出现ENOTEMPTY；保留日志 `platform-tests-cleanup-race.log`。未修改旧测试或放宽断言，最终完整重跑0失败。

## 证据与复现

- 正式测试新增 `tests/phase12/{api,files,git,discovery}.test.cjs`，全部加入 `tests/platform/test-baseline.json`；原有正式 manifest 条目与分类不减少。
- API：Panel-only，Open 路由拒绝；严格参数验证与静态错误；旧 Script API 410。
- 文件：路径与类型、编码/模式、外部进程修改、并发 token、原子发布/写入/目录 fsync 故障。
- Git：真实 origin，literal 文件名、working/staged/binary/large diff、删除和 rename、merge conflict、unborn unstage、WRITE capability、non-fast-forward、多硬链接拒绝。
- 多进程：单独 Node worker 与正式 FD/flock，验证 Editor vs Execution / Git Sync / Editor / Backup，以及 Restore Pending mutation 拒绝。
- 浏览器：fresh DB 启动、真实 Chrome、SSH Git upload/receive、保存/diff/create/stage/commit/push、外部修改冲突、真实长 Task 占用、正式 Sync 触发 GitUpdate、Settings Backup 与另一 DATA_DIR Restore。
- 安全 canary：Git Credential、ENV、Notification、Config，检查 HTTP、WebSocket、console 与页面/localStorage snapshot。最终 **228 个 API 响应、8 个 WebSocket 帧、0 泄漏**；结果见 `diagnostics/phase12/browser-e2e.json`。

规模测试的单次本机观测：20,000 文件 lazy tree 每页最多1,000；文件构建与查询约2.17秒，进程RSS约180MiB；10,000文本文件搜索在200条命中处截断（该次扫描418项），同时设10,000项、32MiB累计读取、256KiB单文件、3秒预算。5,000 Git changes 仅返回100条约5,094字节，进程RSS约262MiB。10MiB diff 明确截断。RSS为完整测试进程快照，不是新增内存或跨机器SLA。

```sh
node scripts/build-back.cjs
./node_modules/.bin/max build
node tests/platform/run.cjs
node diagnostics/phase12/check-typecheck.cjs
node diagnostics/phase12/browser-e2e.cjs
node diagnostics/phase12/static-audit.cjs
```

Backend build 会删除并重建 `static/build`，必须在测试/应用停下后执行。Managed Runtime 回归使用本阶段真实安装的官方 CPython/Node.js；离线依赖源只用于测试包，执行解释器来自 managed Runtime。

## GitNexus 与变更范围

修改前已运行 impact，并保存 `diagnostics/phase12/impact-*.json`。WorkspaceLocks.acquire 为 **CRITICAL**：27 impacted、2 direct callers（with/probe）、9 affected processes，修改前已报告；沿用原锁顺序，增加 inherited FD 与有界输出协议，完整平台套件覆盖原消费者。

部分 TS receiver call graph 未解析，返回 UNKNOWN/0 callers 不作为无影响证明；已人工复核 API → CodeWorkspaceService → WorkspaceFiles/GitCommandService 及旧编辑器消费者。最终 detect_changes 相对 HEAD 返回334个变化symbol、121条affected process、112个文件、CRITICAL；相对 develop 返回4,294个变化symbol、356条process、2,100个文件、CRITICAL且truncated（包含此前阶段）。统计包含删除的旧编辑器和诊断脚本，不等同于新增生产模块数量。HEAD/develop 证据见 `diagnostics/phase12/graph-review-*.json`，结合人工差异审查，不将图的 lower-bound 统计当成完整覆盖。

## 交付文件与清理

- `docs/refactor/phase12/` 已包含全部14篇专题文档；`docs/architecture/19-code-workspace.md` 包含 Worktree消费者、mutation锁、Save和Git流程图。
- 最终截图：`diagnostics/phase12/browser-workspace.png`。浏览器从 Repository 的 Worktrees 页实际点击 Open Workspace，并验证未保存关闭/导航确认。
- 真实Runtime测试完成后，通过正式Task/Environment/Runtime删除入口释放引用、验证并移除测试安装，随后仅删除本次创建的临时根；`cleanup-result.json`为PASS。原有历史诊断文件已恢复，已有用户scripts/bak数据未删除。
- 所有变更留在当前工作区，未提交或推送Git。

## 当前限制与下一阶段

- Linux Validation 为 **PARTIAL — Phase15**；本机 Darwin 的通过不替代 Linux renameat2、flock、进程生命周期及恢复资格验证。
- TypeScript 只要求零新增；剩余历史错误数记录于最终矩阵，不扩大为全项目清零任务。
- 不提供递归删除、终端、hunk staging、merge UI、LSP、Branch 管理或编辑器执行入口。
- 本阶段不添加 CI、Docker 或发布流程。下一阶段固定为 **Phase16A — GitHub Actions CI Foundation → Phase15 → Phase16B**。
