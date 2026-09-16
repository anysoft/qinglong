# Phase 13 Test Evidence

最终状态及准确计数见 [PHASE13_REPORT](../../../PHASE13_REPORT.md)。证据均位于 diagnostics/phase13；首次失败记录只用于说明修复，不是最终PASS依据。

| Gate | Evidence |
|---|---|
| frozen v8/fresh v9/signature/rollback/FK/history/policy | tests/phase13/schema.test.cjs |
| threshold/recovery/flags/channel/delivery/attempt/events/log | domain.test.cjs |
| unsafe URLs/redirect/response limit/old cleaner/logs | security.test.cjs |
| 23 HTTP adapters + SMTP + multipart | providers.test.cjs |
| two processes/SIGKILL/commit/at-least-once | recovery.test.cjs / worker.cjs |
| 100k Runs/100MiB file/10k Outbox/index plan | scale.test.cjs |
| all active platform regression | platform-tests-final.log |
| actual managed Python/Node/TS + Build pin | managed-*-execution.json |
| prior managed Environment lifecycle | managed-regression.log |
| real browser empty DATA_DIR/restart/log/notification | platform-e2e.json / screenshots |
| builds/type budget | *build-final.log / final-typecheck.json |
| static boundaries | static-audit.json |
| call graph scope | graph-review-*.json / GRAPH_REVIEW.md |

Linux统一留Phase15，本次Darwin不记Linux PASS。没有删除、归档或扩大skip旧测试。

平台最终401 tests：398 passed / 0 failed / 3 skipped；独立managed执行2/2、环境生命周期3/3。合计403 passed / 0 failed / 3 skipped，不重复累计专项。21项实时脱敏/执行/Policy针对性验证PASS。3 skips为原有Darwin缺少flock CLI的cache并发条件。

Browser/Fresh 38 steps PASS；1,530 HTTP responses / 110 WebSocket frames（65 Run log），0 canary leaks；重启自动Outbox续发及manual retry通过。Backend/Frontend PASS；Typecheck 34原有 / 32剩余 / 0新增。
