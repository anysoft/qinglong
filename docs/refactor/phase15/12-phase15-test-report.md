# Local test report

The entry hosted Foundation full result is separate from these local working-tree results.
Local host is Darwin. New Ubuntu 24.04 qualification remains pending a new commit/run.

## Implemented verification

- Formal disabled-Cron lifecycle, restart, future re-enable and starvation regression;
  ten independent disable/tick process races.
- Complex ENV through live Shell and real managed Python/Node ESM/tsx; 50 concurrent
  Resolver→Runner executions and immutable baseline while settings change.
- Hook/main failure/CONTINUE/finally, invalid output, PREPARE conflict and timeout
  descendant cleanup through actual Tasks, without the diagnostic Shell dispatcher.
- FD inheritance, retained descendant flock, no-overwrite native rename, private
  socket permissions, twenty concurrent submissions, owner SIGKILL/stale restart.
- Ten socket stress repetitions, all pass at the original protocol deadline.
- Existing Phase7–14 Runtime, execution/recovery, Trigger/Discovery, Workspace/Git,
  observability/notification, Backup/Restore and large-data cases remain active.
- Fresh schema v9/no-rewrite restart, no legacy bootstrap directories, preservation
  of existing user files, Subscription log retention boundary and retired-source absence.
- Qualification workflow/summary failure paths and strict TypeScript zero enforcement.

## Test disposition

Tests whose sole implementation was the physically removed diagnostic task.sh/otask,
CurrentTaskBridgeService, Cron RPC/projection, global dependency cache/install, shell
loopback parsing or ql launcher have been removed. They are not silently excluded by
runner skip flags. Their formal replacement mapping is in `test-disposition.json`
and the bridge matrix. The test baseline retains archived historical classifications
without activating them. Former TEMPORARY tests with real current duties are now
PLATFORM_CORE with explicit owners (process/log/retention/mTLS/config boundaries).

Private snapshot transport tests are removed with the obsolete environment.sh
writer; formal Context/Hook tests retain ENV validation, secret masking, ownership,
recovery and process lifetime coverage. Streaming byte-boundary redaction remains.

## Evidence handling

`platform-final-tests.log` records the last complete pre-final-cleanup regression;
subsequent final test receipts identify any later rerun. Build, raw tsc, static audit,
managed execution, complete browser runs and cleanup/scrub receipts are retained
separately. Original failing disabled-Cron logs and intermediate regression failures
remain distinguishable from final results. No Linux PASS is inferred from local logs.

## Final local receipts

- `platform-final-tests-v2.log`: 385/385, 0 failed, 0 skipped.
- Final backend/frontend builds and raw frontend tsc: PASS, zero TypeScript errors.
- Workspace and full restore/rebuild browser: PASS; ten delayed-refs preparation rounds PASS.
- Collector canary/private-key audit, owned fixture cleanup and archive packaging: PASS.
- GitNexus final all/develop: CRITICAL, 223 changed symbols / 18 affected flows; truncated graph, manually reviewed alongside source inventory.
- Earlier restore rebuild poll timeout remains an unresolved intermittent observation; final complete run passed under the unchanged deadline.
- Local Darwin lacks ShellCheck; strict Ubuntu check remains mandatory. No hosted Phase15 result exists.
