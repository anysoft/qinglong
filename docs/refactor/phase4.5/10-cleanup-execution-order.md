# Phase 4.5B — 可执行顺序与 Gates（计划，尚未执行）

## 总边界

每步独立可审阅、可回退代码改动；只面向新数据。应用遇到非空 QingLong 数据库应拒绝，不做 reset/drop/migrate。发布前使用新的空数据根；原数据不在清理范围。本表 gate 是下一阶段验收条件，本次没有标它们已通过。

| Step | 前置依赖 | SHOULD change / delete | 验证 Gate | 风险 |
| --- | --- | --- | --- | --- |
| 0 固定入口/基线 | 本审计+新 prompt 授权 | 建 core+bridge 测试清单与 fresh fixtures，保存当前代码状态 | helper 无生产写；GitNexus impact；新增 coverage 不缺失 | LOW |
| 1 fresh operational schema | 0；确定仍需桥表 | bootstrap version=1；折叠21链，删旧路径/auth.json/ql repo 启动迁移；Global 新表契约 | empty-root/restart/rollback/FK，旧非空库拒绝，不执行网络/包安装 | CRITICAL |
| 2 Repository-only Subscription | 1，核心 Git 回归 | repository required；去 git_mode/type/url/pull/override/convert；拆 Repository resolver；保留 ID helper/prepare | 创建/编辑/cron+interval/stop/log/无变更重试/disabled/跨仓库 | HIGH |
| 3 独立 Discovery 与 publication bridge | 2 | 从 update.sh 抽仍用扫描函数；Managed 输入用 DB snapshot，不依赖 live crontab.list；ID-based scripts namespace | nested/filter/owned add-drop/multiple subscriptions；copy/DB/scheduler 失败恢复；无 HTTP publication | HIGH |
| 4 移除旧 Git 获取与可选 bot | 2+3 | 删除 Legacy helper else/update_repo/update_raw/git_clone_scripts/ql repo/raw/bot 分支与启动调用；去 repo/raw/ssh legacy 默认布局 | fresh repo/init/fetch/FF/dirty/ref deletion/lease/discovery；所有 bot/clone helper caller 为零 | HIGH |
| 5 统一 ENV | 1；保留 Runner bridge | unique Global+secret；完整 resolved env；所有执行入口接入；删 duplicate/trim/template/三文件生成与读取 | global-only/no-ID/editor/三语言/50并发/UNSET/secret/父环境；无 env.py/js imports | HIGH |
| 6 收敛 API/UI | 2–5 | 去 legacy selector/manual URL/convert/import/410 routes；合并 ENV；删除重复 Repository delete route；界定 internal API | 真实 UI 关键流程、base URL/auth/scope、旧入口404、新入口可用、秘密不回显 | HIGH |
| 7 收尾 filesystem/文档/tests | 所有相应 caller 退场 | 删除 repo/raw 创建引用、归档纯兼容 tests；更新新 baseline/桥清单 | 静态零引用+fresh Linux 容器+node/system/manual 全桥回归+build/browser | HIGH |

实施原子性：Step 1 首先折叠建库路径，保留当时仍被代码查询的字段/表；Subscription 列移除与 Step 2 API/service 切换一起完成，Envs 替换与 Step 5 全入口切换一起完成。中间不部署会缺表/缺列的版本，不新增 QingLong 数据迁移；最终 release 的 fresh v1 schema 统一反映完成后的形状。

Step 1 是 operational baseline（暂保留 Crontabs/Dependences/RunningInstances），不是实施完整 Task/Schedule/Run schema。Step 3 是边界提取和 DB 投影，不实现完整 Phase 11 Discovery v2。Step 5 仅 ENV 传输整合，若为了通过必须全面重写 Runner，则停止该子项并保留 preload 生成文件到后阶段，不能无替代删除。

## 4.5B SHOULD delete

- 旧 URL/raw/credential-in-URL/SSH alias clone 分支，git_mode 与 convert；Subscription credential override。
- 旧数据库补列链与 auth.json、旧路径重写、启动 ql repo/raw；替代 fresh bootstrap 先可用。
- Global 重名 & 聚合/trim/模板执行及三文件生成——仅在 Step 5 全 gates 通过后。
- 已确定失去调用方的 clone/bot helper、已抽出的 update.sh discovery 重复实现、旧 mode UI/410/import routes、重复 metadata repository-delete route。
- 纯兼容断言从新 baseline 归档；保留所有历史报告。

## 4.5B SHOULD replace

Repository-only context、ID publication prefix、DB scanner projection、Global storage+完整 ENV snapshot、ENV UI、fresh schema/bootstrap。将 Shell functions 作为明确内部 adapter，不扩展旧 CLI 契约。

## 4.5B SHOULD keep temporarily

scripts staging；task.sh/otask.sh/share 的执行责任；preload 的 hooks/QLAPI/包解析；全局 Dependences/deps/dep_cache；node-schedule/gRPC/manual queues/system crond/crontab.list output；status/stat/token 内部回环；旧 Config editor/hooks；log reader/retention/运维重载/backup bridge。

## 4.5B MUST NOT touch

- 不实现 Runtime/Python venv/Node versions、Config Assets/Hooks v2、Task/Schedule/TaskRun 全拆分、Execution Engine、Worktree 直跑、Editor v2、Backup v2。
- 不删除 RepositoryStorage/Worktree/GitCredential/锁与 lease、dirty/local commit 保护、认证/2FA/path安全/日志 drain/取消一致性。
- 不整删 update.sh/api.sh/preload/shared helpers，不删除实际用户数据，不将 git/worktrees 当 cache。
- 不提前去掉 internal status/stat 通道，也不删除现有 scheduler 系统能力。

## 后阶段退出 gates

5：Hook 明确 before/success/failure/finally 与环境回传→去旧 hook preload 部分。
6–8：runtime executable/依赖环境/安装锁/取消/持久化→去 global dependency bridge。
9–10：Task source identity + Runner/context/lease/log/result IPC + 所有触发入口→去 Shell/status/crond adapter（若目标决定统一）。
11–12：新发现 reconcile + workspace editor，手工 scripts 内容已有新来源→去最后 scripts copy/editor。
13：Notification events/TaskRun observability；14：资源定义+本地 Git 唯一数据备份与最终收敛。
