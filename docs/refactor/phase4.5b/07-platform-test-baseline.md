# Platform Test Baseline — Final Release Gate

状态：**PASS**。最终 `npm test`：**267 passed / 0 failed / 3 skipped**，共 270 个测试。三个跳过为 macOS 缺少 Linux flock 的既有锁用例；Ubuntu CI 安装 util-linux 后执行。测试数减少不是兼容承诺延续：逐文件归档原因及替代覆盖见下表。

## 显式分类

`tests/platform/test-baseline.json` 是唯一 active manifest；`tests/platform/run.cjs` 在独立私有 QL_DIR 下运行 PLATFORM_CORE 与 TEMPORARY_BRIDGE，ARCHIVED_LEGACY 不进入 release gate。

| Classification | Files |
|---|---:|
| ARCHIVED_LEGACY | 26 |
| PLATFORM_CORE | 35 |
| TEMPORARY_BRIDGE | 38 |

核心覆盖：Fresh schema/bootstrap/failure、Auth/2FA/JWT/会话撤销、Credential/SSH/known_hosts/脱敏、Repository identity/fetch/prune、Worktree dirty/untracked/ahead/diverged/ref deletion/lock/lease、Subscription prepare/manual/schedule/stop/log/retry、Discovery stable identity/DB/scheduler compensation、ENV full snapshot/Secret/50 并发与 parent isolation。

桥覆盖：Task commands/exit/status/log/drain/UTF-8、node/system scheduler projection、dependency install/cancel/recovery/cache、preload/account/hooks/SDK、文件 API 安全、运行实例与统计。没有通过归档删除 2FA、安全认证或 Git 本地历史保护能力。

## 归档明细与替代覆盖

原迁移 TS 文件另存 `tests/archived/legacy/schema/`，不再位于 Backend 编译输入。下表路径为原始路径；对应归档路径统一为 `tests/archived/legacy/<原路径>`。

| Original test | Removed capability / replacement coverage |
|---|---|
| `test/back/deprecated-file-routes.test.cjs` | 410 compatibility removed; api-file-routes replacement |
| `test/back/schema-migrations.test.cjs` | Old DB upgrades removed; fresh-schema and bootstrap-failure preserve fail-closed/rollback coverage |
| `tests/phase0/shell-baseline.test.cjs` | 旧 ql repo/raw acquisition、export-file characterization 能力删除；task runtime 由 environment-entrypoint/execution 与原 active shell safety tests 覆盖。 |
| `tests/phase0/service-baseline.test.cjs` | 旧 Subscription command/ENV generator 删除；依赖命令与真实 node-schedule 保留在 runtime-bridges.test.cjs。 |
| `tests/phase0/database-baseline.test.cjs` | 旧 URL-only Subscription schema 删除；当前 Task 定义/状态/exit bridge 在 task-model-bridge.test.cjs，新 schema 在 fresh-schema.test.cjs。 |
| `tests/phase1/pipeline.test.cjs` | 旧每次 clone acquisition 删除；persistent fetch/FF/protection 由 phase2/workspace、subscription-pipeline 与 repository-recovery 覆盖。 |
| `tests/phase1/resources.test.cjs` | legacy credential priority/convert 删除；资源 identity/reuse/masking/context 核心用例保留在 credential-resources.test.cjs。 |
| `tests/phase1/migration.test.cjs` | 旧 QingLong/checkpoint schema migration 能力删除；原迁移实现归档。fresh-schema.test.cjs 覆盖最终空库、未知库拒绝、FK、事务回滚与重启不改结构。 |
| `tests/phase1/helper.test.cjs` | 旧 URL/SSH alias helper 删除；ID helper、真实独立 helper mTLS 与 Repository credential failure 由 subscription-pipeline 和完整 E2E 覆盖。 |
| `tests/phase2/domain.test.cjs` | 混合旧 mode/迁移测试归档；路径/symlink 在 workspace-paths，资源模型与 binding 在 subscription-domain，fresh rollback 在 fresh-schema。 |
| `tests/phase2/recovery.test.cjs` | 相同恢复能力已转入 repository-recovery.test.cjs 并采用 Repository-only fixture；dirty/lease/local-history 用例保留。 |
| `tests/phase3/discovery.test.cjs` | source update.sh、new Env scraping 与随机 fallback 删除；discovery.test.cjs 覆盖 DB projection、metadata/filter/stable identity/update/compensation。 |
| `tests/phase3/lease.test.cjs` | 无 mode 夹具替换为 subscription-lease.test.cjs；timeout 与 preflight lease 原安全职责保留。 |
| `tests/phase3/pipeline.test.cjs` | 模式字段/旧 scanner fixture 删除；subscription-pipeline.test.cjs 保留 persistent sync、重试、copy/recovery、共享仓库分支覆盖。 |
| `tests/phase3/migration.test.cjs` | 旧 QingLong/checkpoint schema migration 能力删除；原迁移实现归档。fresh-schema.test.cjs 覆盖最终空库、未知库拒绝、FK、事务回滚与重启不改结构。 |
| `tests/phase4/account-mode.test.cjs` | overlay transport 被 full snapshot 替代；environment-account-mode.test.cjs 保留三语言账号与循环语义。 |
| `tests/phase4/redaction.test.cjs` | snapshot 格式替代；environment-redaction.test.cjs 保留流式 Secret 与 UTF-8 边界。 |
| `tests/phase4/domain.test.cjs` | Global 聚合被唯一 key 替代；environment-domain.test.cjs 覆盖统一 contract/优先级/Secret/profile 错误。 |
| `tests/phase4/entrypoint.test.cjs` | 无 scope bypass 删除；environment-entrypoint.test.cjs 覆盖真实 ID/no-ID/parent isolation/cleanup。 |
| `tests/phase4/transport.test.cjs` | 旧 Global copies/overlay 删除；environment-transport.test.cjs 覆盖 full files、权限、owner、stale、容量预算。 |
| `tests/phase4/isolation.test.cjs` | 旧形状替换为 environment-isolation.test.cjs；同/跨 Repo、Task、malformed Secret 错误边界保留。 |
| `tests/phase4/legacy-characterization.test.cjs` | 重复 key & 聚合、trim/template semantics 为明确删除能力；literal/unique/UNSET 在 environment-domain/execution 中反向约束。 |
| `tests/phase4/api.test.cjs` | 旧全局 /envs panel 模型删除；environment-api.test.cjs 覆盖统一 Global/Profile/Task、Secret 与授权。 |
| `tests/phase4/execution.test.cjs` | 旧 overlay 夹具替换为 environment-execution.test.cjs；四语言 literal 和 50 个真实同时运行冻结/隔离覆盖。 |
| `tests/phase4/migration.test.cjs` | 旧 QingLong/checkpoint schema migration 能力删除；原迁移实现归档。fresh-schema.test.cjs 覆盖最终空库、未知库拒绝、FK、事务回滚与重启不改结构。 |
| `test/back/env-name-parsing.test.cjs` | Generated Global export-file parsing removed with zero production consumers; environment-transport, environment-shell-runtime and environment-account cover full snapshot isolation/literal/cleanup instead. |

## 独立验收

- `final-platform-tests.log`：267/0/3；归档前过渡运行 `step7-platform-tests.log` 为 272/0/3，差值是删除 export-file parser 后的 5 项旧语义测试。
- `final-build.log`：Backend clean build 与 Frontend production build PASS。构建只删除 compiler-owned static/build，不清理用户数据。
- `final-typecheck.json`：原 65 → 剩余 54，新增 0。原始 tsc 仍退出 2（PARTIAL）；`check-typecheck.cjs` 以原始诊断多重集验证新增/增加为 0，不隐藏类型问题。
- `platform-e2e.json`：真实空目录 HTTP/gRPC + 浏览器 SSH Credential/Repository/Subscription/Worktree/ENV/三语言日志/禁用启用/重启重跑 PASS，无 HTTP mock。
- `.github/workflows/validate.yml`：Ubuntu Node 22、pnpm frozen install、build/test/typecheck budget、隔离 Playwright/ssh2 + Chromium、相同 Fresh browser harness、产物归档。当前宿主无 Docker/Podman/Colima/Lima，Linux 实机结果为 PARTIAL，未伪称通过。

## 复现

```sh
pnpm install --frozen-lockfile
cp .env.example .env
pnpm build:back
pnpm test
pnpm build:front
node diagnostics/phase4.5b/check-typecheck.cjs
# Linux 环境先安装 git openssh-client openssl python3 jq perl util-linux
# 将下列目录设置为本次验证专用目录，不复用用户数据目录
export QL_BROWSER_RUNTIME=/tmp/qinglong-platform-browser/node_modules
npm install --prefix /tmp/qinglong-platform-browser --no-audit --no-fund ssh2@1.17.0 playwright@1.58.2
node /tmp/qinglong-platform-browser/node_modules/playwright/cli.js install --with-deps chromium
pnpm test:platform:e2e
```

运行时使用 Node 22。macOS harness 使用已安装 Chrome；Linux 使用上述 Chromium。私有夹具由 harness 创建并清理，不接触现有用户仓库/数据库。
