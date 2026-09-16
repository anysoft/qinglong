# Bridge disposition

Phase 15 replaces the previous temporary bridge architecture. The authoritative per-item
implementation and verification matrix is [Bridge finalization](../refactor/phase15/05-bridge-finalization.md),
with machine-readable completion in `diagnostics/phase15/bridge-audit.json`.

Removed source includes diagnostic Shell launchers, implicit preload/SDK injection, staged source
mapping, Cron projection controllers/RPC, Shell status/token loopback, global dependency management,
old ql operations and obsolete Script/backup routes. No new code may depend on those contracts.

Retained formal responsibilities have owners: Subscription recurrence; typed platform settings;
explicit notification providers/SDK source; sync/system log domains; Config materialization,
leases and recovery. A formal owner is not permission to restore a retired consumer.

Schema v9 and existing user directories are preserved. Storage compatibility is distinct from
running old domain behavior. Historical entries in [TEMPORARY_BRIDGES](../../TEMPORARY_BRIDGES.md)
remain evidence of earlier phases, not active requirements.
