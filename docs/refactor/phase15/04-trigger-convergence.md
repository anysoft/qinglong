# Disabled Cron semantics

Schema v9 already persists `TaskTrigger.enabled`; it remains the admission flag.
`CronTrigger.next_fire_at` is NOT NULL, so a disabled trigger keeps its frozen,
dormant timestamp. The timestamp is neither advanced nor displayed as an active
deadline. There is no new schema version and no far-future sentinel.

The scheduler selects enabled TaskTrigger IDs in SQL **before** the due-row limit.
Filtering after LIMIT would allow 500 disabled rows to starve valid work. Tick and
trigger updates retain IMMEDIATE transactions. A pre-disable committed event can
exist, while no event may be created from ticks after the disable transaction.

Saving an existing disabled Cron preserves its dormant deadline. Saving/enabling
an enabled Cron recomputes the next occurrence against the service clock inside
the write transaction. Re-enable therefore starts in the future, not from the
disabled interval. The injectable clock makes the one-day gap deterministic in
tests without changing the production clock.

Evidence: `tests/phase15/disabled-cron.test.cjs` covers restart and repeated ticks,
re-enable with no replay, 501 disabled rows ahead of one enabled row, and ten real
disable/tick process races. The original implementation failed both initial
regressions; `disabled-cron-before.log` preserves that run. Current focused logs
record the fixed behavior. Discovery's user-owned fields and tombstones keep
their existing semantics.
