# Phase 1 migration and API

## Startup migration

`migrateSchema` keeps its existing SQLite IMMEDIATE transaction. It creates GitCredentials and Repositories, records `phase1-git-resources`, and adds nullable Subscriptions.repository_id / credential_id references with RESTRICT. Existing migration IDs stay unchanged; total recorded migrations becomes 18 (15 previous + 3 additions). Fresh ORM tables and upgraded tables both declare the references.

No existing subscription is automatically converted, no URL/branch/alias/pull_option is overwritten, and no task, script or repository directory is touched. Any failure rolls back table/column additions and migration records together; startup still rejects migration failure. Repeated startup is idempotent.

Before deployment, stop writers and take an offline SQLite backup using the existing backup procedure. For rollback, stop writers and restore the pre-upgrade database alongside the pre-upgrade application. Do not attempt a destructive down migration while subscriptions reference new resources. This task tested isolated databases only; it has not upgraded a user's live database.

## Opt-in conversion

1. Save a safe credential separately for private repositories; verify SSH known_hosts if applicable.
2. In an existing subscription modal, choose an optional conversion credential and click Convert to Repository.
3. Backend normalizes the saved URL, find-or-creates the unique repository, verifies checkout spelling compatibility and selected access metadata, then sets only the two nullable references.
4. Equivalent URLs reuse the same repository; original URL, branch, alias and pull options remain intact. No subscription is run. Schedule registration switches future executions to the helper.
5. Any directory collision is shown as a warning. No scripts are moved or deleted.

An embedded credential URL is rejected with a static URL validation message. UI explicitly explains manual cleanup; automatic Extract Credential is intentionally not implemented. Existing private subscriptions require an explicitly selected reusable credential. If an existing deduplicated repository uses a different transport, the selected credential must match that transport. Different raw spellings that would change clone path are rejected, not silently migrated.

## HTTP endpoints

All paths below use `/api` and existing panel authentication; Git resource routes reject `/open`.

| Method | Path | Action |
| --- | --- | --- |
| GET | /git-credentials | Local list + has_secret + reference counts |
| GET | /git-credentials/:id | Public metadata/detail |
| POST / PUT | /git-credentials | Create / update; PUT requires id |
| DELETE | /git-credentials/:id | Reject if in use |
| POST | /git-credentials/:id/test | `{remote_url}`; read-only ls-remote |
| GET | /repositories | Local list + subscription counts |
| GET | /repositories/:id | Detail |
| POST / PUT | /repositories | Create / update metadata; PUT requires id |
| DELETE | /repositories/:id | Reject if in use |
| POST | /repositories/normalize | `{remote_url}` → safe identity metadata |
| POST | /repositories/:id/test | Read-only test with default credential |
| POST | /subscriptions/:id/convert | Optional `{credential_id}`; no execution |
| POST / PUT | /subscriptions | Existing shape plus nullable repository_id/credential_id and response warnings |

Success follows `{code:200,data}`. New resource errors return an HTTP error status with `{code,message}` and never return raw validation/process/SQL errors. New backed subscriptions may omit url; effective remote is always resolved from Repository. Old clients still use url without references. Reference deletion is guarded both by service transaction checks and database constraints.
