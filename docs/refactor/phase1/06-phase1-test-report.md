> **Historical Refactor Records — Greenfield Direction (Phase 4.5A)**
> 本文保留历史实现与验证证据；其中 QingLong compatibility / migration / legacy behavior preservation 不再是现行设计要求。新方向仅支持 Fresh Install，见[平台架构](../../architecture/00-platform-overview.md)。当前仍被使用的桥接层按删除计划与退出 gate 保留，不能依据此标记直接删代码。

# Phase 1 verification

Verified on macOS with Node 22.23.2, existing lockfile dependencies, Git and OpenSSH. No production server or live database was started. Core tests use in-memory SQLite, temporary directories and local Git fixtures; no provider account or public GitHub remote is required.

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Existing test/back + test/front | 176 | 0 | 3 |
| Phase 0 baseline | 17 | 0 | 0 |
| Phase 1 tests | 33 | 0 | 0 |
| Total node:test | **226** | **0** | **3** |

Separately, one headless Chrome UI workflow passed using actual new resource APIs/services and an isolated in-memory SQLite database. Existing panel login/system responses are fixture responses, not a real user session. It covers credential create/retain, non-echoed secret, repository parse/create/default binding, subscription repository selection and legacy fallback. Existing SockJS transport is provided by the harness. No real network access test is performed from the browser.

Backend production build and Umi frontend production build both passed. Standalone frontend tsc reports 65 errors in 26 files; an isolated `git archive HEAD` copy reports the same 65 errors, with identical file/error/message multiset. No Phase 1 type errors remain. These existing Umi export/implicit-any errors are not claimed fixed. The build still warns about existing bundle size and old browserslist data.

## Reproduce

```sh
npx --yes --package=node@22 -c 'node diagnostics/phase0/run-tests.cjs existing'
npx --yes --package=node@22 -c 'node diagnostics/phase0/run-tests.cjs baseline'
npx --yes --package=node@22 -c 'node --test tests/phase1/*.test.cjs'
npx --yes --package=node@22 -c 'npm run build:back'
npx --yes --package=node@22 -c 'npm run build:front'
```

Optional browser workflow: set `PLAYWRIGHT_MODULE` to an installed Playwright package path and run `node diagnostics/phase1/ui-smoke.cjs` with Node 22 after the frontend build. It uses locally installed Chrome and writes a screenshot to `/tmp/ql-phase1-ui.png` (override UI_SCREENSHOT). Playwright is a diagnostic dependency, not added to the application lockfile.

Three existing skips are flock-dependent tests on macOS. The host Node 26 incompatibility identified in Phase 0 remains; supported Node 22 was used consistently.

## Coverage and scenarios

| Evidence | Covered behavior |
| --- | --- |
| normalization.test.cjs | HTTPS/SCP/ssh identity dedup, GitHub/GitLab/Gitee/Generic, case preservation, ports, suffix/path grammar, unsafe URL rejection |
| migration.test.cjs | Old data preserved, nullable references, new resource tables, idempotence, injected failure rollback/retry |
| resources.test.cjs | A/B/C/D/H/I: anonymous repo, shared HTTPS and SSH credentials, stable name/ID, duplicates, secret replacement, delete protection; precedence, disabled/missing/invalid credentials; actual encrypted SSH key derivation; read-only access test dispatch/status/cleanup; active snapshot during DB update |
| security.test.cjs | Raw/encoded/header/URL/PEM redaction, split chunks, private file modes, concurrent HTTPS/SSH contexts, READ gate, transport validation, safe overflow, timeout and process-group termination |
| pipeline.test.cjs | F/G/J: HTTPS-like auth boundary mock with real local git clone and unchanged whole update.sh; ls-remote probe without checkout; main/dev; depth=1; destructive repeat clone; scripts copy; auto-task payload; zero Token in argv/config/output |
| helper.test.cjs | Runtime ID resolution, original shell positional contract, failure and initialization-cancellation cleanup |
| api.test.cjs | Real HTTP routing, input whitelist, static secret-safe errors and original /open rejection |
| Existing + Phase 0 | E: legacy clone, automatic/manual tasks, Python/Node/Shell execution, ENV, logs, schedules and existing security checks |

The existing migration-count assertion was updated from 15 to 18 and strengthened with the resource migration ID assertion. Phase 0's in-memory ORM setup now creates the two referenced tables; all original task/data assertions remain. No test was removed, weakened or newly skipped to make Phase 1 pass.

## Review and practical limits

GitNexus reindexed the actual tree and detect_changes compared against develop: 8 tracked files, 19 symbols, 21 affected flows, cumulative risk CRITICAL. The warning was surfaced. Central Subscription create/update/schedule paths explain the propagation; graph absence does not prove no caller. Anonymous router/React and several dynamic ORM edges remain UNKNOWN. Untracked new files are indexed but absent from Git diff's tracked-hunk report; they were reviewed via an explicit file inventory and the new tests.

`git diff --check` passed. Shell, CronService, ScheduleService, ENV, dependency, legacy formatUrl and legacy SshKeyService implementation files have zero diff from HEAD. No worktree/bare repository, Task binding or runtime feature was introduced.
