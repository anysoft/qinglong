# 全部测试文件分类与 case 明细

逐声明标题用于定位；参数化 case 保留模板。分类结合对应生产责任，混合文件不得按主分类整文件删除。ARCHIVE 表示未来动作，本阶段所有文件仍保留。

| Test file | Classification | 下一步 |
| --- | --- | --- |
| test/back/auth-security.test.cjs | PLATFORM CORE + COMPATIBILITY | 逐case区分安全与旧格式；不整文件删 |
| test/back/build-provenance.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/cron-log-name.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/cron-validation.test.cjs | PLATFORM CORE + COMPATIBILITY | 逐case区分安全与旧格式；不整文件删 |
| test/back/dashboard-failures.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/dependence-cache-status.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/deprecated-file-routes.test.cjs | PLATFORM CORE + COMPATIBILITY | 逐case区分安全与旧格式；不整文件删 |
| test/back/ecosystem.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/env-name-parsing.test.cjs | PLATFORM CORE + COMPATIBILITY | 逐case区分安全与旧格式；不整文件删 |
| test/back/execution-lifecycle.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/file-access-security.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/fileTreeListing.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/grpc-cron-response.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/http-exclusive-listen.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/http-security.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/listen-security.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/log-path-security.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/logReader.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/manual-execution.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/manual-stop-claim.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/metrics.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/monitoring.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/node-path-cache.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/node-path-lock.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/primary-apm.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/process-exit-state.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/protected-path-case.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/qlServiceLogCommand.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/retention.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/schedule-health.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/scheduler-file-lock.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/scheduler-mutation.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/scheduler-readiness.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/scheduler-reconciliation.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/scheduler-rpc-timeout.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/schema-migrations.test.cjs | COMPATIBILITY + PLATFORM CORE | 归档旧库升级/ledger；保留 fresh事务/FK/失败拒绝 |
| test/back/shell-api-parsing.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/sock-security.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/stop-race.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/subscription-cleanup.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/system-dependence-cache.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/task-time.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| test/back/user-api.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/user-security.test.cjs | PLATFORM CORE + COMPATIBILITY | 逐case区分安全与旧格式；不整文件删 |
| test/back/worker-apm.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/back/wpush-grpc.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| test/front/http-error.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase0/database-baseline.test.cjs | LEGACY REGRESSION + TEMPORARY BRIDGE | 拆旧clone/ENV断言归档；保留三语言/调度/退出码能力 |
| tests/phase0/service-baseline.test.cjs | LEGACY REGRESSION + TEMPORARY BRIDGE | 拆旧clone/ENV断言归档；保留三语言/调度/退出码能力 |
| tests/phase0/shell-baseline.test.cjs | LEGACY REGRESSION + TEMPORARY BRIDGE | 拆旧clone/ENV断言归档；保留三语言/调度/退出码能力 |
| tests/phase1/api.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase1/helper.test.cjs | COMPATIBILITY + PLATFORM CORE | 归档旧clone参数；保留 credential isolation/cancel/cleanup |
| tests/phase1/migration.test.cjs | COMPATIBILITY + PLATFORM CORE | 归档旧库升级/ledger；保留 fresh事务/FK/失败拒绝 |
| tests/phase1/normalization.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase1/pipeline.test.cjs | COMPATIBILITY + PLATFORM CORE | 归档旧clone参数；保留 credential isolation/cancel/cleanup |
| tests/phase1/resources.test.cjs | PLATFORM CORE + COMPATIBILITY | 保留CRUD/Secret；归档convert/override/legacy collisions |
| tests/phase1/security.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase2/api.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase2/domain.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase2/locks.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase2/recovery.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase2/workspace.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase3/cron-publication.test.cjs | PLATFORM CORE + TEMPORARY BRIDGE | 保留dirty/lease/publish rollback；去切回Legacy及旧parser语义 |
| tests/phase3/discovery.test.cjs | PLATFORM CORE + TEMPORARY BRIDGE | 保留dirty/lease/publish rollback；去切回Legacy及旧parser语义 |
| tests/phase3/lease.test.cjs | PLATFORM CORE + TEMPORARY BRIDGE | 保留dirty/lease/publish rollback；去切回Legacy及旧parser语义 |
| tests/phase3/migration.test.cjs | COMPATIBILITY + PLATFORM CORE | 归档旧库升级/ledger；保留 fresh事务/FK/失败拒绝 |
| tests/phase3/pipeline.test.cjs | PLATFORM CORE + TEMPORARY BRIDGE | 保留dirty/lease/publish rollback；去切回Legacy及旧parser语义 |
| tests/phase4/account-mode.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| tests/phase4/api.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase4/domain.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase4/entrypoint.test.cjs | TEMPORARY BRIDGE + PLATFORM CORE | bridge存续期间执行；替换实现后移植安全/可靠性断言 |
| tests/phase4/execution.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase4/isolation.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase4/legacy-characterization.test.cjs | COMPATIBILITY → ARCHIVE | 4.5B 去重复/trim/template 后归档 |
| tests/phase4/migration.test.cjs | COMPATIBILITY + PLATFORM CORE | 归档旧库升级/ledger；保留 fresh事务/FK/失败拒绝 |
| tests/phase4/redaction.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase4/repository-deletion.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |
| tests/phase4/transport.test.cjs | PLATFORM CORE | 保留；随新领域API调整fixture，不降低断言 |

## 逐 case / 场景证据

### test/back/auth-security.test.cjs

- valid legacy and platform sessions retain compatibility — 兼容/历史断言需拆分，保留其中安全能力
- session membership never bypasses JWT signature, expiry, algorithm or nbf — 能力/桥接验证保留或移植（以文件级 gate 为准）
- platform token metadata can shorten but cannot extend JWT expiration — 能力/桥接验证保留或移植（以文件级 gate 为准）
- passwords are salted and legacy plaintext can migrate without changing the password — 兼容/历史断言需拆分，保留其中安全能力

### test/back/build-provenance.test.cjs

- build verification accepts matching source and rejects stale or dirty artifacts — 能力/桥接验证保留或移植（以文件级 gate 为准）
- release images receive the same-run artifact and verify it before use — 能力/桥接验证保留或移植（以文件级 gate 为准）
- complete artifact manifests reject changed, missing, extra files and untracked build inputs — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/cron-log-name.test.cjs

- form and API accept Chinese log names and existing supported names — 能力/桥接验证保留或移植（以文件级 gate 为准）
- form and API still reject unsafe relative names and excessive length — 能力/桥接验证保留或移植（以文件级 gate 为准）
- API restricts absolute log paths to the configured directory or /dev/null — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/cron-validation.test.cjs

- cron validation accepts leading-zero schedules and legacy null labels — 兼容/历史断言需拆分，保留其中安全能力
- cron validation identifies invalid fields — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/dashboard-failures.test.cjs

- today failures includes recovered and deleted tasks, excluding previous days and successes — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/dependence-cache-status.test.cjs

- dependency listing marks cache entries missing from disk for reinstall — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/deprecated-file-routes.test.cjs

- ${moduleName} filename route points callers to its detail API — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/ecosystem.test.cjs

- container logging discards stdout and forwards startup errors without persistent copies — 能力/桥接验证保留或移植（以文件级 gate 为准）
- non-container installs keep the PM2 logging defaults — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/env-name-parsing.test.cjs

- matches legacy pipeline for whitespace, malformed lines, CRLF and final unterminated line — 兼容/历史断言需拆分，保留其中安全能力
- resets prior names for an empty file — 能力/桥接验证保留或移植（以文件级 gate 为准）
- extracting names never evaluates command substitutions or shell syntax in values — 能力/桥接验证保留或移植（以文件级 gate 为准）
- clear_env removes listed exports and preserves unrelated values — 能力/桥接验证保留或移植（以文件级 gate 为准）
- large configuration preserves order and duplicate names — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/execution-lifecycle.test.cjs

- spawn failure settles without exit, and the next scheduled run can proceed — 能力/桥接验证保留或移植（以文件级 gate 为准）
- completion waits for slow log consumers and preserves the final output — 能力/桥接验证保留或移植（以文件级 gate 为准）
- exit is not completion, and UTF-8 split across writes remains intact — 能力/桥接验证保留或移植（以文件级 gate 为准）
- failed log sink drains large output instead of blocking the child — 能力/桥接验证保留或移植（以文件级 gate 为准）
- PID response keeps queue capacity occupied until cleanup completes — 能力/桥接验证保留或移植（以文件级 gate 为准）
- before/error/end callback failures settle and release capacity — 能力/桥接验证保留或移植（以文件级 gate 为准）
- concurrent writes and closes preserve all bytes, and failed files can be closed — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/file-access-security.test.cjs

- file access enforces directory boundaries, blacklist descendants and symlinks — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/fileTreeListing.test.cjs

- readDirs preserves the recursive tree contract and ignores blocked entries — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/grpc-cron-response.test.cjs

- gRPC cron response preserves Sequelize model fields through protobuf serialization — 能力/桥接验证保留或移植（以文件级 gate 为准）
- legacy plain cron rows normalize absent repeated fields — 兼容/历史断言需拆分，保留其中安全能力

### test/back/http-exclusive-listen.test.cjs

- HTTP listener preserves private binding and releases its port after shutdown — 能力/桥接验证保留或移植（以文件级 gate 为准）
- custom cluster deployments can restore shared listening — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/http-security.test.cjs

- HTTP authentication protects init, scopes, expired sessions and config secrets — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/listen-security.test.cjs

- HTTP binding ${host} never broadens an explicit private address — 能力/桥接验证保留或移植（以文件级 gate 为准）
- gRPC binding ${host} never broadens an explicit private address — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/log-path-security.test.cjs

- log streams reject traversal, sibling prefixes and escaping symlinks before writing — 能力/桥接验证保留或移植（以文件级 gate 为准）
- log initialization rejects unsafe paths before mkdir or file writes — 能力/桥接验证保留或移植（以文件级 gate 为准）
- manual execution rejects escaping log names before creating directories or spawning — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/logReader.test.cjs

- log reader defaults to a bounded tail and supports incremental reads — 能力/桥接验证保留或移植（以文件级 gate 为准）
- log reader enforces the maximum chunk size — 能力/桥接验证保留或移植（以文件级 gate 为准）
- log reader preserves UTF-8 characters across byte boundaries — 能力/桥接验证保留或移植（以文件级 gate 为准）
- missing logs return an empty chunk — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/manual-execution.test.cjs

- manual execution captures a short child before slow status storage and flushes before release — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/manual-stop-claim.test.cjs

- manual startup loses its conditional claim after ${conflict} and terminates the late child — 能力/桥接验证保留或移植（以文件级 gate 为准）
- verified termination waits for a SIGTERM-resistant target to exit — 能力/桥接验证保留或移植（以文件级 gate 为准）
- a runner waiting for a concurrency slot cannot adopt a newer queued generation — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/metrics.test.cjs

- metrics keep only the newest bounded samples — 能力/桥接验证保留或移植（以文件级 gate 为准）
- empty metric queries return finite aggregates — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/monitoring.test.cjs

- health probes bypass request metric retention with or without base URL — 能力/桥接验证保留或移植（以文件级 gate 为准）
- non-health requests keep bounded service metrics — 能力/桥接验证保留或移植（以文件级 gate 为准）
- ordinary request metrics are sampled instead of retained per request — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/node-path-cache.test.cjs

- warm cache avoids pnpm, preserves spaces, and never evaluates cached text — 能力/桥接验证保留或移植（以文件级 gate 为准）
- config, environment, cwd, and executable changes invalidate discovery — 能力/桥接验证保留或移植（以文件级 gate 为准）
- expired or malformed records refresh and failed lookups are not cached — 能力/桥接验证保留或移植（以文件级 gate 为准）
- disabled or unavailable cache falls back without changing discovery output — 能力/桥接验证保留或移植（以文件级 gate 为准）
- concurrent refreshes publish complete records and do not overwrite symlink targets — 能力/桥接验证保留或移植（以文件级 gate 为准）
- task entry tolerates discovery failure with errexit enabled — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/node-path-lock.test.cjs

- simultaneous cold and expired lookups share one successful refresh — 能力/桥接验证保留或移植（以文件级 gate 为准）
- waiters with different configuration do not reuse another key — 能力/桥接验证保留或移植（以文件级 gate 为准）
- lock timeout falls back while a holder is still alive — 能力/桥接验证保留或移植（以文件级 gate 为准）
- absent or unsupported flock and unsafe lock paths preserve discovery — 能力/桥接验证保留或移植（以文件级 gate 为准）
- failed refresh releases lock and does not publish a success — 能力/桥接验证保留或移植（以文件级 gate 为准）
- refresh leaves the caller file descriptor and umask unchanged — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/primary-apm.test.cjs

- container APM policy keeps worker isolation and can restore all inherited probes — 能力/桥接验证保留或移植（以文件级 gate 为准）
- standalone PM2 monitoring stays enabled — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/process-exit-state.test.cjs

- termination accepts Linux exited state ${state} before PID reaping — 能力/桥接验证保留或移植（以文件级 gate 为准）
- termination keeps waiting while the process is running — 能力/桥接验证保留或移植（以文件级 gate 为准）
- a process disappearing during the procfs read is accepted — 能力/桥接验证保留或移植（以文件级 gate 为准）
- permission failures are not reported as successful termination — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/protected-path-case.test.cjs

- rejects case variations under protected API namespaces — 能力/桥接验证保留或移植（以文件级 gate 为准）
- allows normalized protected paths and unrelated paths — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/qlServiceLogCommand.test.cjs

- ql log reads the requested system log history without PM2 — 能力/桥接验证保留或移植（以文件级 gate 为准）
- ql log follows the current Winston system log without PM2 — 能力/桥接验证保留或移植（以文件级 gate 为准）
- ql log reports when no persisted system log exists — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/retention.test.cjs

- retention policy defaults to disabled and clamps invalid values — 能力/桥接验证保留或移植（以文件级 gate 为准）
- directory preview counts files recursively and ignores symlinks — 能力/桥接验证保留或移植（以文件级 gate 为准）
- cleanup previews first, protects running instances, and uses explicit options — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/schedule-health.test.cjs

- schedule health check uses the HTTP health endpoint and system logs — 能力/桥接验证保留或移植（以文件级 gate 为准）
- returns serving for a healthy prefixed HTTP service — 能力/桥接验证保留或移植（以文件级 gate 为准）
- reports recent system logs when HTTP startup fails — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/scheduler-file-lock.test.cjs

- scheduler lock survives nested file writes and releases after ${ failOperation ? 'failure' : 'success' } — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/scheduler-mutation.test.cjs

- recovery snapshot cannot overwrite concurrent ${operation} — 能力/桥接验证保留或移植（以文件级 gate 为准）
- recovery waits for an admitted mutation to finish registration before reading the DB — 能力/桥接验证保留或移植（以文件级 gate 为准）
- ${operation} preserves scheduler 503 after rollback and releases its lock — 能力/桥接验证保留或移植（以文件级 gate 为准）
- scheduler lock excludes a second OS process and leaves no lock after completion — 能力/桥接验证保留或移植（以文件级 gate 为准）
- ${operation} aborts on RPC ${code} with deletion applied=${applied} and reconciles the original DB — 能力/桥接验证保留或移植（以文件级 gate 为准）
- configuration rollback cannot restore an obsolete manual queue token — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/scheduler-readiness.test.cjs

- readiness stays false through failed restoration and retries without idle polling — 能力/桥接验证保留或移植（以文件级 gate 为准）
- single-flight recovery cannot mark an invalidated generation ready — 能力/桥接验证保留或移植（以文件级 gate 为准）
- mutation waiting is bounded, a later recovery can succeed — 能力/桥接验证保留或移植（以文件级 gate 为准）
- probe failure immediately invalidates a previously ready scheduler — 能力/桥接验证保留或移植（以文件级 gate 为准）
- health uses actual readiness and returns HTTP 503 until recovery — 能力/桥接验证保留或移植（以文件级 gate 为准）
- recovery registration errors propagate while ordinary autosave retains file synchronization — 能力/桥接验证保留或移植（以文件级 gate 为准）
- scheduler probe uses the cron channel and failed writes are not replayed — 能力/桥接验证保留或移植（以文件级 gate 为准）
- scheduler health probe never calls back into HTTP health — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/scheduler-reconciliation.test.cjs

- recovery reconciles a surviving scheduler after missed deletes and disables, including an empty DB — 能力/桥接验证保留或移植（以文件级 gate 为准）
- invalid replacement leaves the previous schedule intact — 能力/桥接验证保留或移植（以文件级 gate 为准）
- pre-RPC channel failures invalidate readiness and return 503 without executing or replaying writes — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/scheduler-rpc-timeout.test.cjs

- ${method} invalidates an uncertain timed-out write without replaying it — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/schema-migrations.test.cjs

- legacy database upgrades without losing rows and repeated migration is idempotent — 兼容/历史断言需拆分，保留其中安全能力
- migration failure rolls back added columns and can be retried after repair — 能力/桥接验证保留或移植（以文件级 gate 为准）
- offline pre-upgrade backup restores the legacy schema and data — 兼容/历史断言需拆分，保留其中安全能力
- database loader rejects initialization failure rather than allowing workers to start — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/shell-api-parsing.test.cjs

- valid token cache is read with one jq and reused without generation — 能力/桥接验证保留或移植（以文件级 gate 为准）
- expired, corrupt, missing or header-unsafe token cache refreshes under errexit — 能力/桥接验证保留或移植（以文件级 gate 为准）
- success with a message still parses once and stays silent — 能力/桥接验证保留或移植（以文件级 gate 为准）
- status and statistics errors preserve multiline Unicode messages — 能力/桥接验证保留或移植（以文件级 gate 为准）
- non-JSON errors fall back to raw text and absent messages retain legacy null — 兼容/历史断言需拆分，保留其中安全能力
- statistics without a task id perform no JSON parsing — 能力/桥接验证保留或移植（以文件级 gate 为准）
- canonical success resets prior errors and matches jq missing-message semantics — 能力/桥接验证保留或移植（以文件级 gate 为准）
- noncanonical JSON always uses jq, including whitespace, duplicate keys and embedded success text — 能力/桥接验证保留或移植（以文件级 gate 为准）
- success-shaped invalid documents retain the raw-response error fallback — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/sock-security.test.cjs

- WebSocket connections reject expired tokens and close when sessions are revoked — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/stop-race.test.cjs

- stop wins when shell exit writes error or success during termination, preserving exit codes — 能力/桥接验证保留或移植（以文件级 gate 为准）
- late shell completion cannot overwrite stopped instances — 能力/桥接验证保留或移植（以文件级 gate 为准）
- rows created after the stop snapshot are not relabelled — 能力/桥接验证保留或移植（以文件级 gate 为准）
- repeated stop does not rewrite historical rows or their finished timestamps — 能力/桥接验证保留或移植（以文件级 gate 为准）
- batch stop captures running instances from every requested cron — 能力/桥接验证保留或移植（以文件级 gate 为准）
- stop signals every snapshotted PID exactly once and preserves a later running instance — 能力/桥接验证保留或移植（以文件级 gate 为准）
- failed termination is not finalized as stopped — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/subscription-cleanup.test.cjs

- subscription becomes idle and closes its log even when completion logging fails — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/system-dependence-cache.test.cjs

- clearing a dependency cache marks installed entries for reinstall — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/task-time.test.cjs

- Linux task timestamps share a snapshot and retain millisecond log names across midnight — 能力/桥接验证保留或移植（以文件级 gate 为准）
- explicit log paths and output mode remain intact — 能力/桥接验证保留或移植（以文件级 gate 为准）
- task failure keeps exit code and minimum one-second runtime — 能力/桥接验证保留或移植（以文件级 gate 为准）
- manual stop retains stopped message and exit status reporting — 能力/桥接验证保留或移植（以文件级 gate 为准）
- ${mode} keeps legacy time conversion helpers — 兼容/历史断言需拆分，保留其中安全能力

### test/back/user-api.test.cjs

- initialization returns the username and password validation result — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/user-security.test.cjs

- initialization checks state inside a serialized mutation — 能力/桥接验证保留或移植（以文件级 gate 为准）
- password change revokes sessions and closes connected clients — 能力/桥接验证保留或移植（以文件级 gate 为准）
- a concurrent old-password login cannot restore a session after reset — 能力/桥接验证保留或移植（以文件级 gate 为准）
- legacy plaintext migrates after a successful login — 兼容/历史断言需拆分，保留其中安全能力
- TOTP failures are counted serially and further attempts are throttled — 能力/桥接验证保留或移植（以文件级 gate 为准）
- TOTP challenge expires and valid codes cannot be reused in the same step — 能力/桥接验证保留或移植（以文件级 gate 为准）
- active two-factor secret cannot be silently replaced and disabling revokes sessions — 能力/桥接验证保留或移植（以文件级 gate 为准）
- default credentials with historical metadata still require initialization — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/worker-apm.test.cjs

- PM2-managed primary disables only inherited worker APM and keeps worker metadata — 能力/桥接验证保留或移植（以文件级 gate 为准）
- worker APM opt-in restores inherited PM2 settings, including explicit disable — 能力/桥接验证保留或移植（以文件级 gate 为准）
- standalone startup does not introduce a PM2-specific override — 能力/桥接验证保留或移植（以文件级 gate 为准）
- replacement workers receive the same monitoring policy — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/back/wpush-grpc.test.cjs

- WPUSH survives protobuf and JSON round trips without changing existing modes — 能力/桥接验证保留或移植（以文件级 gate 为准）
- decoded SystemNotify requests reach WPUSH with explicit or saved configuration — 能力/桥接验证保留或移植（以文件级 gate 为准）

### test/front/http-error.test.cjs

- validation errors include the failing field names — 能力/桥接验证保留或移植（以文件级 gate 为准）
- existing API error details remain visible — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase0/database-baseline.test.cjs

- actual ORM tables, automatic and manual tasks, and execution exit code in isolated SQLite — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase0/service-baseline.test.cjs

- production ENV generator merges enabled duplicates, omits disabled and invalid names across three languages — 能力/桥接验证保留或移植（以文件级 gate 为准）
- characterization: JavaScript ENV evaluates template expressions; Shell preserves literal — 兼容/历史断言需拆分，保留其中安全能力
- characterization: shell trims combined ENV; JS preserves surrounding whitespace — 兼容/历史断言需拆分，保留其中安全能力
- Subscription command preserves legacy argument order, embedded credentials and flags — 兼容/历史断言需拆分，保留其中安全能力
- dependency command generation retains global Node and optional Python prefix without installing packages — 能力/桥接验证保留或移植（以文件级 gate 为准）
- real node-schedule trigger reaches production runTask and drains stdout/stderr — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase0/shell-baseline.test.cjs

- real local clone, nested discovery, metadata and auto-create API payloads — 能力/桥接验证保留或移植（以文件级 gate 为准）
- update deletes ${dirty} workspace and reclones upstream — 兼容/历史断言需拆分，保留其中安全能力
- different branches use separate clones; same URL and branch reuse destructive destination — 兼容/历史断言需拆分，保留其中安全能力
- actual task.sh executes ${runtime}, injects ENV, captures output and reports status — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase1/api.test.cjs

- Git resource HTTP boundary never reflects submitted secrets or internal errors; routes are read/write specific — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase1/helper.test.cjs

- internal helper resolves resources at execution and passes unchanged positional repo contract — 兼容/历史断言需拆分，保留其中安全能力
- internal helper cleans credentials on subprocess failure and initialization-time cancellation — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase1/migration.test.cjs

- Phase1 migration is additive, preserves rows and nullable legacy references, idempotent — 兼容/历史断言需拆分，保留其中安全能力
- Phase1 schema and columns roll back together after an injected failure — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase1/normalization.test.cjs

- same GitHub identity: ${remote} — 能力/桥接验证保留或移植（以文件级 gate 为准）
- provider neutral nested identity: ${host} — 能力/桥接验证保留或移植（以文件级 gate 为准）
- generic paths remain case sensitive and nondefault ports distinct — 能力/桥接验证保留或移植（以文件级 gate 为准）
- reject unsafe or credentialized URL without reflecting input — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase1/pipeline.test.cjs

- F/G/J: authenticated HTTPS-like fixture uses unchanged update.sh, shallow destructive branch clones, copy and task discovery — 兼容/历史断言需拆分，保留其中安全能力

### tests/phase1/resources.test.cjs

- A/B/D/H/I: stable identity, reusable credentials, secret replacement and deletion protection — 能力/桥接验证保留或移植（以文件级 gate 为准）
- resolution priority, nullable legacy fallback, disabled and missing credentials — 兼容/历史断言需拆分，保留其中安全能力
- manual conversion deduplicates equivalent URLs and preserves legacy fields; warns collisions — 兼容/历史断言需拆分，保留其中安全能力
- C: encrypted SSH key validation derives public key, preserves secret privacy and supports reuse — 能力/桥接验证保留或移植（以文件级 gate 为准）
- access tests use only ls-remote, update status, hide remote errors and clean contexts — 能力/桥接验证保留或移植（以文件级 gate 为准）
- credential update does not mutate the snapshot of a running invocation — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase1/security.test.cjs

- redacts split output, authorization, URL, private material and encoded secrets — 能力/桥接验证保留或移植（以文件级 gate 为准）
- concurrent HTTPS contexts have private immutable snapshots and idempotent cleanup — 能力/桥接验证保留或移植（以文件级 gate 为准）
- SSH contexts isolate keys and require verified known_hosts — 能力/桥接验证保留或移植（以文件级 gate 为准）
- disabled, missing, wrong transport and READ push fail closed — 能力/桥接验证保留或移植（以文件级 gate 为准）
- bounded output cannot leak a partial secret at truncation boundary; timeout terminates — 能力/桥接验证保留或移植（以文件级 gate 为准）
- timeout terminates a child process group before credential cleanup — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase2/api.test.cjs

- workspace HTTP API rejects paths/force/ref injection and preserves operation error codes — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase2/domain.test.cjs

- managed paths use IDs, reject traversal, symlink escape and case collisions — 能力/桥接验证保留或移植（以文件级 gate 为准）
- Phase1 database upgrades atomically and idempotently without changing legacy rows — 兼容/历史断言需拆分，保留其中安全能力
- an existing Phase1 DB rolls back partial Phase2 DDL and preserves resources on retry — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase2/locks.test.cjs

- cross-process POSIX locks release after owner crash, success and errors — 能力/桥接验证保留或移植（以文件级 gate 为准）
- repository mutation matrix and execution lease exclusivity — 能力/桥接验证保留或移植（以文件级 gate 为准）
- real Git timeout and controller crash during Git release locks after child termination — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase2/recovery.test.cjs

- worktree deletion DB failure is recoverable by reconstruction without resetting local history — 能力/桥接验证保留或移植（以文件级 gate 为准）
- repository delete can retry after filesystem success and DB failure — 能力/桥接验证保留或移植（以文件级 gate 为准）
- operation timeout persists ERROR and releases mutation lease — 能力/桥接验证保留或移植（以文件级 gate 为准）
- ignored files and symlink replacement protect user data; orphan worktrees are diagnosed — 能力/桥接验证保留或移植（以文件级 gate 为准）
- remote spelling changes preserve identity and storage while protecting legacy subscriptions — 兼容/历史断言需拆分，保留其中安全能力
- Git core.worktree override cannot redirect status or mutations outside managed checkout — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase2/workspace.test.cjs

- bare initialization is persistent; fetch updates/prunes remote refs and uses current credentials — 能力/桥接验证保留或移植（以文件级 gate 为准）
- branch worktrees share objects; fetch never moves a worktree; update is explicit FF only — 能力/桥接验证保留或移植（以文件级 gate 为准）
- dirty, staged, ignored/untracked and conflicts are visible and protected — 能力/桥接验证保留或移植（以文件级 gate 为准）
- local commits are retained; diverged and detached worktrees cannot be reset by update/delete — 能力/桥接验证保留或移植（以文件级 gate 为准）
- execution leases block mutation and prune; missing worktrees remain records and repair preserves branch — 能力/桥接验证保留或移植（以文件级 gate 为准）
- non-git storage and managed-path symlink replacements never trigger recursive deletion — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase3/cron-publication.test.cjs

- strict Managed crontab install reports errors while original default behavior is preserved — 兼容/历史断言需拆分，保留其中安全能力

### tests/phase3/discovery.test.cjs

- staging uses original discovery metadata and leaves live scripts unchanged — 能力/桥接验证保留或移植（以文件级 gate 为准）
- invalid regular expression fails before publishing — 能力/桥接验证保留或移植（以文件级 gate 为准）
- autoAddCron=false still copies scripts — 能力/桥接验证保留或移植（以文件级 gate 为准）
- extensions, include/exclude, dependency copy and nested TypeScript keep old scanner semantics — 能力/桥接验证保留或移植（以文件级 gate 为准）
- autoDelCron=${autoDel} retains original removal semantics — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase3/lease.test.cjs

- staging Bash timeout kills its process group and releases the existing POSIX lease — 能力/桥接验证保留或移植（以文件级 gate 为准）
- preflight refuses an execution lease instead of accepting cached clean status — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase3/migration.test.cjs

- Phase3 migration is additive and idempotent; both existing subscription types remain Legacy — 兼容/历史断言需拆分，保留其中安全能力
- failed Phase3 DDL rolls back all added columns and can retry — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase3/pipeline.test.cjs

- explicit mode switch, first sync, retry without duplicate Tasks, FF update and rollback to Legacy — 兼容/历史断言需拆分，保留其中安全能力
- ${state} Worktree preserves last scripts and Tasks — 能力/桥接验证保留或移植（以文件级 gate 为准）
- discovery failure preserves last good state and retry at same commit succeeds — 能力/桥接验证保留或移植（以文件级 gate 为准）
- shared repository/branch binding is retained and blocks worktree deletion — 能力/桥接验证保留或移植（以文件级 gate 为准）
- fetch, scanner, copy and Cron failures preserve Tasks; every failure can retry — 能力/桥接验证保留或移植（以文件级 gate 为准）
- network failure never reaches discovery — 能力/桥接验证保留或移植（以文件级 gate 为准）
- partial Cron registration failure restores original ID and scripts — 能力/桥接验证保留或移植（以文件级 gate 为准）
- retry at already updated commit applies old scanner add/drop — 能力/桥接验证保留或移植（以文件级 gate 为准）
- copy failure leaves current scripts intact — 能力/桥接验证保留或移植（以文件级 gate 为准）
- Managed leases block overlapping sync, update and binding changes — 能力/桥接验证保留或移植（以文件级 gate 为准）
- symlink source is refused without reading or copying outside data root — 能力/桥接验证保留或移植（以文件级 gate 为准）
- branch selection creates a new binding and preserves the old Worktree — 能力/桥接验证保留或移植（以文件级 gate 为准）
- ${failure} stops before scripts and Task diff — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/account-mode.test.cjs

- scoped ${language} account concurrency keeps split secrets in private temporary logs — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/api.test.cjs

- real HTTP APIs mask secrets and validation errors, enforce scope and block open access — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/domain.test.cjs

- profile CRUD, uniqueness, default, clone secrets, and reference protection — 能力/桥接验证保留或移植（以文件级 gate 为准）
- secret keep/replace/clear, metadata edits, atomic batch rollback and safe errors — 能力/桥接验证保留或移植（以文件级 gate 为准）
- profile precedence, manual task, disabled and wrong repository fail closed — 能力/桥接验证保留或移植（以文件级 gate 为准）
- SET/UNSET/disabled/empty precedence, immutable snapshot and parent isolation — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/entrypoint.test.cjs

- real ID-to-SQLite shell bridge resolves current config, cleans per-run files and fails disabled profiles — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/execution.test.cjs

- actual Python/Node/Shell snapshot complex values, UNSET, no interpolation or secret logs — 能力/桥接验证保留或移植（以文件级 gate 为准）
- 50 parallel isolated executions and frozen values after configuration update — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/isolation.test.cjs

- cross-repository and same-repository profiles stay isolated with task overrides; next unscoped run has no residue — 能力/桥接验证保留或移植（以文件级 gate 为准）
- malformed scoped request JSON is never echoed by the HTTP error boundary — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/legacy-characterization.test.cjs

- pre-integration characterization: actual task.sh ${language} duplicates, disabled host fallback, spaces, templates — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/migration.test.cjs

- Phase 3 upgrade is additive, idempotent and indexed, with nullable bindings and unchanged globals — 兼容/历史断言需拆分，保留其中安全能力
- failed DDL rolls back tables, references and ledger, then safely retries — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/redaction.test.cjs

- streaming secret redaction preserves UTF-8 and masks literal and JSON-escaped multiline values — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/repository-deletion.test.cjs

- profile references block repository filesystem deletion before mutation — 能力/桥接验证保留或移植（以文件级 gate 为准）

### tests/phase4/transport.test.cjs

- snapshot cleanup preserves live owners, removes stale dead owners, rejects symlinks and oversized environment — 能力/桥接验证保留或移植（以文件级 gate 为准）
- unconfigured task never allocates a snapshot or changes global generated files — 兼容/历史断言需拆分，保留其中安全能力
