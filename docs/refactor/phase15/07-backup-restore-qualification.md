# Backup and restore qualification

Schema remains v9. No migration, table drop, in-place data rewrite or deletion of
existing scripts/deps/cache/bak content is part of this phase.

Required existing gates remain unchanged in scope: platform mutation exclusion,
SQLite consistency and invalid-schema rejection, portable archive validation,
credential/passphrase handling, Git/Config domain validation, owner-marked staging,
offline apply/restart, interruption journal and rollback. Qualification explicitly
runs Phase14 barrier/portable/production/sqlite suites on Ubuntu.

The full browser workflow uses a fresh backend, real Runtime/Environment resources,
Task/Trigger/ENV/Config/Hook execution, logging and notifications, then portable
backup, failure checks, fresh restore, rebuild and another execution. It also
restarts the real backend and verifies durable state. It is not a UI-only smoke test.

The old `/system/data/export` and `/system/data/import` tombstones are physically
removed. Their browser check now expects HTTP 404 instead of a JSON 410 response.
The unauthenticated Backup boundary and all restore/runtime scenarios remain.
That expectation change describes an intentional API removal, not an assertion
weakened to hide a restore failure. Local final browser output and its scrubbed
artifact are the evidence; hosted Linux restore remains pending a new workflow.
