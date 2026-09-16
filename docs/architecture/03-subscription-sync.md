# Subscription sync and Discovery

Subscription references Repository and a selected Worktree/ref. Its normal pipeline
is Repository fetch → Worktree ensure/update → Discovery reconciliation → Git-trigger
admission. Failure leaves the prior successful watermark intact and records its
actual phase/error. No legacy URL-mode pipeline or script staging runs alongside it.

Discovery owns stable source identities and policy revisions. Existing Task fields
owned by the user, disabled overrides and tombstones retain their conflict rules.
Discovery does not publish system crontab or write an executable Shell command
projection as the Task definition.

ScheduleService handles only internal Subscription recurrence and invokes the
server-generated subscription command. Its queue slot lasts through process output
drain and cleanup. User Task recurrence belongs to TriggerScheduler/TriggerEvents;
manual and scheduled Task execution converge through ExecutionService.

Subscriptions keep generated sync logs under `log/subscription-ID/`. Retention is
an explicit platform policy, excludes active syncs and does not touch TaskRun logs.
See [Trigger contracts](15-discovery-triggers.md) and [operations](20-platform-operations.md).
