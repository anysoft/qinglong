# Phase 1 Status

> Historical report. Phase 1 is now committed in baseline `53ac03c8`. Phase 2 additively extends storage and Worktrees; see [PHASE2_REPORT.md](PHASE2_REPORT.md). The original delivery statements below describe the Phase 1 snapshot.

Phase 1 implemented on `develop`, against Phase 0 baseline commit `4eb27427f809b565202f0b1bfa8129073f3fe5bd`. Changes are local and uncommitted. No live database was upgraded or deployment performed.

## Domain Model

PASS — independent GitCredential and Repository; provider-neutral identity; branch remains on Subscription.

## Database Migration

PASS — transactional, idempotent, two new tables and two nullable compatibility references; failure rollback tested.

## Git Credential

PASS — anonymous, HTTPS Token, SSH Key (including passphrase/public key derivation), reuse, READ/WRITE metadata, retain/replace, reference protection and read-only access test.

## Repository

PASS — stable normalized identity, deduplication, nullable default credential, editable name, reference-protected metadata deletion, local listing and access test.

## Subscription Compatibility

PASS — old URL path retained; repository default and subscription override resolution; opt-in conversion; collision warnings; unchanged shell pipeline.

## Secret Security

PASS within the Phase 1 contract — no new API secret echo, credentialized repository URLs rejected, isolated askpass/SSH contexts, strict known_hosts and log redaction. SQLite secrets remain plaintext by explicit design; see limitations.

## API

PASS — resource CRUD/detail/test/normalize and conversion endpoints; original /open requests cannot manage new resources.

## UI

PASS — 仓库管理 with Repositories/Credentials tabs, secret retain/replace, source selector and opt-in conversion. Headless Chrome workflow passed against isolated real resource services/APIs.

## Legacy Regression

PASS — existing 176 passed / 0 failed / 3 skipped; Phase 0 17 passed / 0 failed. Baseline assertions preserved.

## New Tests

PASS — 33 passed / 0 failed / 0 skipped. Total node:test: **226 passed / 0 failed / 3 skipped**, plus 1 browser workflow. Backend/frontend production builds passed. Standalone frontend typecheck has the same 65 pre-existing errors as HEAD, no additions.

## Production Behavior Changed

NO for existing subscription clone/task/runtime/ENV behavior. Additive resource APIs/UI, nullable schema, warnings and the new repository-backed credential path are new behavior. New-path log buffering/limits do not apply to old subscriptions.

| Production behavior gate | Changed? |
| --- | --- |
| Existing Subscription behavior | NO — legacy execution preserved; additive warnings/fields |
| Repo clone path algorithm | NO |
| Branch behavior | NO |
| Scripts copy behavior | NO |
| Auto-create Task behavior | NO |
| Task runtime | NO |
| ENV behavior | NO |

## Database Changes

- `back/data/gitCredential.ts`: GitCredentials, public ORM scope excludes secret.
- `back/data/repository.ts`: Repositories with unique normalized_url and nullable credential FK; no branch or local path.
- `back/data/subscription.ts`: nullable repository_id / credential_id, RESTRICT references.
- `back/shared/schemaMigrations.ts` + `gitResourceMigration.ts`: existing migration transaction extended, 18 records in total.
- Existing records remain legacy; no automatic secret extraction or resource conversion.

## API Changes

`/api/git-credentials` and `/api/repositories`: GET list/detail, POST create, PUT metadata update, DELETE metadata, POST `/:id/test`; repositories also has POST `/normalize`. POST `/api/subscriptions/:id/convert` is opt-in and never runs a subscription. Existing subscription create/update accepts optional resource references and returns collision warnings. See [complete API and migration guide](docs/refactor/phase1/07-phase1-migration.md).

## UI Changes

New top-level 仓库管理 entry; local lists, reference counts, disabled deletion when used, manual access tests, automatic URL metadata display, nullable default credential, masked Secret and retain/replace. Subscription modal adds Existing Repository / Manual URL (Legacy), override selector and Convert to Repository. No task page or runtime workflow change.

## Legacy Compatibility

`SubscriptionGitResolver` owns effective URL/credential resolution. The internal `back/gitSubscription.ts` helper builds a private auth context and invokes unchanged `shell/update.sh repo`. Existing shallow destructive clone, script copy, scanner and task APIs remain authoritative. Multiple branches still use separate ephemeral clones. Same-path collisions warn without introducing locking or renaming.

All original Phase 0 data/task assertions remain. Two test setup expectations track the additive schema: total migration count and creation of referenced resource tables in isolated ORM tests.

## Security Improvements

Secret access centralized in CredentialSecretService; public DTOs never include secret fields. Tokenized resource URLs and unsafe new-path arguments are rejected. Credential material stays in per-invocation 0600 files under 0700 directories, askpass executable contains no secret, and finally removes contexts. SSH host checks are strict. Timeout/cancellation terminates the invocation's process group. Captured output is redacted across chunks; access test errors are static. A credential update does not mutate an already-running snapshot.

Existing SshKeyService is retained for legacy subscriptions only because its persistent configuration and disabled host checks do not meet the new-path contract.

## Important Findings

- GitNexus cumulative detection is **CRITICAL**: 8 tracked files / 19 symbols / 21 associated flows. The warning was surfaced; central Subscription scheduling entry points require careful review despite green regression tests. New untracked files are separately reviewed; graph reporting is incomplete for anonymous/dynamic callers.
- Existing update.sh exits 0 even when clone fails; this Phase 1 keeps that behavior. Manual access tests use actual git status.
- Alias is still a log/SSH/removal key and does not necessarily equal checkout name. Repository identity never depends on it; collision warnings are advisory.
- Complete source/build/test evidence and implemented diagrams are in [Phase 1 documentation](docs/refactor/phase1/02-repository-model.md) and [verification report](docs/refactor/phase1/06-phase1-test-report.md).

## Known Limitations

1. Secrets are plaintext in SQLite and backups. No encryption-at-rest claim; the service abstraction supports a later vault implementation.
2. Administrator-verified known_hosts is required for SSH; automatic trusted provider key distribution/rotation is not implemented. SSH key validation is real, transport integration is mocked locally rather than against public provider accounts.
3. New subscription output is buffered, capped at 4 MiB (body omitted on overflow), and has a one-hour helper timeout; access tests use 30 seconds. Old logs/timeouts are unchanged.
4. SIGKILL, crash or power loss cannot run finally; no crash-proof cleanup guarantee. Arbitrary adversarial re-encoding of secrets or administrator-authored malicious hooks is outside the redaction guarantee.
5. Conservative new URL/path grammar; remote spelling is immutable, conversion rejects spelling changes that alter old clone paths. No automatic extraction of embedded legacy credentials.
6. No checkout locking/lease, persistent workspace, full-clone policy, push UI or Task/ENV/runtime binding. Collision warnings do not prevent concurrent overwrites.
7. New resource endpoints require a panel session, not /open app credentials. Old /open endpoints remain.
8. Three flock-dependent tests skip on macOS. Existing 65 frontend tsc errors and bundle/browserslist warnings remain, while production builds pass.

## Phase 2 Preconditions

Start with **Repository object storage and checkout ownership/locking design**, using stable Repository IDs and this compatibility adapter as the seam. First specify bare-store lifecycle, branch checkout ownership, locking/lease/cancellation, failure recovery and a reversible migration from ephemeral subscription checkouts. Treat current scripts copy and Task execution as explicit contracts. Do not introduce worktree or Task bindings until those contracts, fixtures and rollback conditions are accepted.

Phase 2 was not started.
