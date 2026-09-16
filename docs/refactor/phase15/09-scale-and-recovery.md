# Scale and recovery evidence

Use actual TAP results and stage records; elapsed times are environment-dependent
and are not service-level promises.

| Domain | Required existing/new evidence |
|---|---|
| Scoped execution | 50 live Resolver/Runner executions, immutable A while settings change to B |
| Submission socket | 20 concurrent writes plus SIGKILL/stale-owner recovery; 10 complete stress rounds |
| Disabled Cron | 501 dormant rows cannot starve a valid trigger; 10 real disable/tick process races |
| Discovery / Cron | Existing Phase11 reconciliation and scale fixtures |
| Workspace / Git | Existing Phase12 bounded large-tree/status/diff and concurrent publication tests |
| Observability | Existing Phase13 large-history/log/outbox fixtures and pagination limits |
| Backup | Existing Phase14 real process interruption, journal replay and consistency tests |

The first broad local run included two old diagnostic-fixture failures while a
backend rebuild was running concurrently. Their isolated recheck passed 20/20;
concurrent compiler interference is an inference, not a proven root cause. Those
retired diagnostic launchers are replaced by formal Task lifecycle/ENV tests and
physically removed. Final regression runs after backend compilation, without
concurrently rebuilding the shared backend output.

The socket admission failure was independently repeatable and fixed in production:
parallel SQLite IMMEDIATE writers are serialized with a bounded queue. Protocol
deadlines were not widened and tests do not retry until green. Critical native
and crash suites run again on Ubuntu through repository qualification scripts.

Last complete 385-test local run: 5,000-file Discovery used 40 write queries;
5,000 Cron definitions used one timer and the due index. Workspace exercised
20,000 files and bounded 10,000-file search; Git status covered 5,000 changes.
Observability exercised 100,000 Runs, a 100 MiB log and 10,000 outbox rows.
Backup also snapshot/validated/restored 100,000 Run records and 100 MiB logs.
These are fixture sizes verified by assertions, not production capacity guarantees.
