# Phase 14 Status: PARTIAL

**未完成 Phase 14。当前只交付未接入生产入口的基础模块，不是可用的平台 Backup / Restore。**
不能创建 READY 平台快照，不能恢复用户 DATA_DIR；不能进入 Phase 12。
分支 `codex/phase14-backup-restore`，基线 `88a059c8`，schema 仍为 v9。

| Item | Status |
|---|---|
| Data Classification | PARTIAL — 首轮分类与 B16 审计已记录，完整资源检查未实现 |
| Consistent Snapshot | PARTIAL — 只有跨进程屏障原语，业务入口未接入 |
| SQLite Backup | PARTIAL — VACUUM INTO / integrity / FK / WAL 单独测试通过 |
| Git Backup | PARTIAL — 未实现 |
| Worktree Backup | PARTIAL — 归档路径保护已实现，Git metadata / mode 恢复未实现 |
| Config / Secret Backup | PARTIAL — 未实现平台内容清单/校验 |
| Run / Log Backup | PARTIAL — 有大文件流式模块测试，无平台快照 |
| Notification State Backup | PARTIAL — 未接入 |
| Portable Encryption | PARTIAL — 容器模块测试通过，无平台 Export API/UI |
| Backup Validation | PARTIAL — 只有基础文件/SQLite/归档校验 |
| Restore Staging | PARTIAL — 有私有空目录解包，无 restore operation |
| Offline Restore | PARTIAL — 未实现 |
| Restore Crash Recovery | PARTIAL — 只测试屏障 owner 崩溃，非 DATA_DIR 切换 |
| Git Repair | PARTIAL — 未实现 |
| Runtime Reconciliation | PARTIAL — 未实现 |
| Resource Rebuild | PARTIAL — 未实现 |
| Browser E2E | PARTIAL — 未运行 |
| Fresh Restore E2E | PARTIAL — 未运行 |
| B16 Removal | PARTIAL — 旧入口仍保留，替代退出条件未满足 |
| Linux Validation | PARTIAL — Phase15 |

## 已实现范围

- [数据分类](docs/refactor/phase14/01-data-classification.md)：实际路径、UNIQUE/REBUILDABLE/EPHEMERAL/CONDITIONAL、Git ignored 用户文件与 journal 原件保护。
- [基础模块契约](docs/refactor/phase14/02-foundation-contracts.md)：格式、安全边界、尚未接入处、继续实施顺序。
- `back/services/backup/files.ts`：私有目录与 regular/no-follow/owner/nlink 检查，私有 JSON、fsync、hash、完整写入。
- `envelope.ts`：scrypt + AES-256-GCM、版本化固定 header AAD、随机 salt/nonce、流式导入导出、失败删除本次明文临时文件、派生 key 清零。
- `archive.ts`：有界 framing，无压缩，严格路径/类型/大小/count、流式 SHA256、拒绝 hardlink/special、安全相对链接、拒绝源内输出。
- `sqlite.ts`：VACUUM INTO，自包含副本，SQLite integrity/FK 验证，不依赖源 WAL。
- `barrier.ts`：真实 FD shared/exclusive 门禁、QUIESCING/排空/冻结、timeout、SIGKILL 遗留状态恢复。尚未协调平台各服务，不能称一致备份。

## Backup Format / Manifest / Local Security

容器与归档草案版本为 1，详见基础契约；无压缩，不引入外部加密 CLI。
所有本次输出目录/文件私有，口令只由模块参数 Buffer 传入；没有公开下载入口。
完整 immutable manifest、inventory、component summaries/checksums、READY 原子发布均未实现。
Local Snapshot 敏感明文边界已定义，但正式 Snapshot 尚未建立。

## Barrier / SQLite / Git / Config / Logs / Notifications

屏障只在测试中调用；跨资源 idle callback 的正式实现与长操作生命周期接入尚缺。
SQLite 单独 snapshot 正确不等于 DB↔Git↔Config↔Logs 一致。
Git fsck/整对象库/dirty 工作区修复、Config revision 验证、日志缺失 contract、Outbox SENDING 等待均待实施。

## Restore / CLI / UI / Bootstrap / Journal / Atomic Switch

未实现 offline CLI、Panel API/UI、restore request、startup bootstrap、版本化 checksum journal、
pre-restore safety snapshot、old/candidate 原子切换、post-switch rollback 及七点 crash matrix。
不提供在线覆盖路径。屏障 SIGKILL 测试不能替代 Restore crash recovery。

## Runtime / Rebuild / Trigger / Notification Semantics

当前 Runtime 定义已有 MISSING，环境已有 EMPTY/ERROR 和 Build health=MISSING；READY Build 的
state 有 immutable trigger，不能直接随意改状态。正式 reconciliation 和 rebuild plan 仍须设计验证。
未添加 schema v10，未改冻结历史 schema，未删除 definitions、Build history、锁文件或用户数据。
Trigger identity/dedupe/next_fire、TaskHealth/incident 和通知历史恢复尚无 E2E 证据。

## Tests / Builds / Typecheck

最终全量回归：**410 passed / 0 failed / 3 skipped**（413 tests），新增12项纳入平台manifest。
后端/前端构建PASS；Typecheck 32 existing / 32 remaining / 0 new，raw exit2，预算gate PASS。
最终结果见 `diagnostics/phase14/verification.json`；最终平台回归为 `platform-tests-final.log`。
专项已覆盖正确/错误口令、header/cipher/tag tamper、truncation/trailing、path traversal、
symlink parent、link/../escape、hardlink、特殊 archive entry、size/count、100MiB streaming、
WAL snapshot、FK corruption、FD barrier timeout 与独立进程 SIGKILL。

首轮全量回归与 build 错误并行，static/build 被清空导致旧 launcher 测试失败；该日志保留，
不作为最终验收。最终回归须等待后端构建完成再运行；未跳过或修改旧用例。

## Performance / Security / Important Findings

100MiB 流式往返有 RSS 采样；这不等于 100k TaskRuns + 多 Git 文件的完整平台性能门禁。
解包保留私有权限，原始 file mode 尚须由 Snapshot manifest 记录并在 restore 验证后还原。
Darwin 临时目录经 /var symlink；fixture 使用 realpath，生产目录仍严格拒绝 symlink。
Node FileHandle write stream 的关闭等待曾造成测试 pending，改为 async pipeline sink + 完整 write 循环。

## Bridges / Linux / Known Limitations

B16 未移除。旧 tar 导出/导入不是当前平台可靠完整备份，不应据此声称灾难恢复能力已完成。
其他桥维持 Phase13 状态；禁用 Cron 仍产生 SKIPPED 的已知问题 carry Phase15。
没有 Docker/CI/Release/Code Editor 改动。Linux 未验证，既有 32 项类型债务另列。

## 下一步

继续 Phase 14 的业务接入、完整 Snapshot/Manifest、离线 Restore/Crash、API/UI/CLI、
真实跨根灾难恢复和 B16 替代验收。**Phase 12 的前置条件当前未满足。**

## GitNexus 范围检查

HEAD：187 symbols / 17 flows / CRITICAL；develop 累计 3662 symbols / 239 flows，输出截断。
新模块仅测试调用，未修改现有生产入口；UNKNOWN 已通过文本搜索补充，不等于图谱完整证明。
见 [Graph Review](diagnostics/phase14/GRAPH_REVIEW.md)。未 commit / push。
