# Phase 0 交付文件清单

仅列本阶段新增文件；用户既有 `refactor/` 未修改，生产跟踪文件无diff。

| File | Purpose |
|---|---|
| `PHASE0_REPORT.md` | Phase 0总报告 |
| `diagnostics/phase0/inventory.py` | 只读清单生成/隔离测试运行辅助 |
| `diagnostics/phase0/run-tests.cjs` | 只读清单生成/隔离测试运行辅助 |
| `docs/refactor/00-phase0-current-architecture.md` | 架构审计文档 |
| `docs/refactor/01-current-data-model.md` | 架构审计文档 |
| `docs/refactor/02-current-git-subscription-flow.md` | 架构审计文档 |
| `docs/refactor/03-current-task-execution-flow.md` | 架构审计文档 |
| `docs/refactor/04-current-env-model.md` | 架构审计文档 |
| `docs/refactor/05-current-dependency-model.md` | 架构审计文档 |
| `docs/refactor/06-current-filesystem-layout.md` | 架构审计文档 |
| `docs/refactor/07-current-risks.md` | 架构审计文档 |
| `docs/refactor/08-refactor-impact-map.md` | 架构审计文档 |
| `docs/refactor/09-repository-worktree-coupling.md` | 架构审计文档 |
| `docs/refactor/10-legacy-compatibility-contract.md` | 架构审计文档 |
| `docs/refactor/11-test-baseline.md` | 架构审计文档 |
| `docs/refactor/12-source-inventory.md` | 架构审计文档 |
| `docs/refactor/13-delivery-manifest.md` | 架构审计文档 |
| `fixtures/test-repo/README.md` | 本地测试仓库输入 |
| `fixtures/test-repo/nested/annotated.js` | 本地测试仓库输入 |
| `fixtures/test-repo/node/example.js` | 本地测试仓库输入 |
| `fixtures/test-repo/node/package.json` | 本地测试仓库输入 |
| `fixtures/test-repo/python/example.py` | 本地测试仓库输入 |
| `fixtures/test-repo/requirements/requirements.txt` | 本地测试仓库输入 |
| `fixtures/test-repo/shell/example.sh` | 本地测试仓库输入 |
| `tests/phase0/database-baseline.test.cjs` | 隔离基线测试 |
| `tests/phase0/service-baseline.test.cjs` | 隔离基线测试 |
| `tests/phase0/shell-baseline.test.cjs` | 隔离基线测试 |

新增文件总数：27。

验证：`git diff --exit-code -- back src shell docker deploy package.json pnpm-lock.yaml test` 无差异；所有新增文件保持未stage，未自动commit。
