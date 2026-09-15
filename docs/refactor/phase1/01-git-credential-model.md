# GitCredential model

Phase 1 introduces `back/data/gitCredential.ts`, table `GitCredentials`, following Sequelize's existing `id`, `createdAt`, `updatedAt` conventions.

| Field | Meaning |
| --- | --- |
| name | Unique, editable display name |
| provider | github / gitlab / gitee / generic; display hint, not access permission |
| auth_type | anonymous / https_token / ssh_key |
| username | HTTPS username; defaults to `git` at execution |
| secret | Private JSON payload accessed only by CredentialSecretService; excluded by default ORM scope |
| public_key | Derived using ssh-keygen; never accepted from public API input |
| known_hosts | Administrator-verified OpenSSH host keys |
| capability | READ default; WRITE also allows a future push operation |
| status | enabled / disabled |
| last_test_at, last_test_result | Last explicit successful process invocation's access result |

Public DTO adds `has_secret`, derived `fingerprint`, `used_by.repositories`, `used_by.subscriptions`, `used_by.total`. No token, private key or passphrase is returned. Anonymous clears stored secret. Updates retain secret unless `replace_secret=true`; supplying secret material without choosing replacement is rejected. Invalid replacement rolls back metadata and secret together.

One credential may serve many repositories and subscription overrides. Deletion checks both types of direct references in an IMMEDIATE SQLite transaction. Repository inherited usage is represented by its repository reference, not multiplied by every subscription. Provider names do not restrict which remote a credential may authenticate against. Transport mismatch is rejected.

WRITE is metadata plus a resolver gate, not a implemented push endpoint. The server's actual permissions remain authoritative. A READ credential cannot invoke resolver operation `push`.
