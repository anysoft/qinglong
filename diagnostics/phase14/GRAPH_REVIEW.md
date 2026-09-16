# Phase 14 production integration scope review

Repository/worktree: qinglong, `/Users/jonhy/PersonalDatas/Codes/github/anysoft/qinglong`.
Continuation baseline HEAD: `fd4270e1`. No commit/push.

GitNexus MCP is unavailable; the installed LocalBackend and `.gitnexus/run.cjs analyze` provide the same indexed queries. The refreshed graph contains 15,664 nodes, 41,057 edges and 464 flows. New symbols initially returned UNKNOWN; manual caller review covered API/CLI/startup callers. Existing scheduler/runtime/execution/hook entrypoints were impact-checked before modification; HIGH/CRITICAL findings were reported.

After refresh, BackupValidator.domains has 3 direct callers, 13 indexed upstream symbols and 5 affected process groups: snapshot action, validation/stage, backup API, startup, barrier. Risk CRITICAL. One unresolved receiver was omitted by inference; this is a lower bound. The log-kind validation change is covered by a dedicated negative test and the production restore suite.

`detect_changes` uses an isolated temporary Git index to include untracked additions without changing the user's staging area. HEAD comparison: 417 changed indexed symbols, 156 files, 64 affected flows, CRITICAL. This includes tests, diagnostics and documentation; it is not a count of behavior changes. Develop comparison spans previous phases: 3,954 symbols, 2,000 files, 273 flows, CRITICAL; the result is truncated. Full graph extraction also reports entrypoint/callee budgets. Missing edges or flows are not evidence that a caller is absent.

Scope is the Backup/Restore production domain, mutation/lifetime admission, runtime restore transitions, Settings UI, legacy B16 removal and test fixture adaptations. Existing tests remain in the platform manifest. Graph evidence supplements build, regression, crash-injection and browser/fresh recovery checks; it does not replace them. See the final PHASE14_REPORT.md for gate results and limitations.

Final additions include route-handler lifetime protection and bounded foreign-key violation reads. API handler abort test, full browser restore/rebuild/trigger/notification chain, and provider/rebuild state tests provide dynamic coverage. Final document/evidence updates after indexing do not change production call graphs.
