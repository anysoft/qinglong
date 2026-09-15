# Repository model and implemented architecture

`RepositoryService` owns metadata, normalization, uniqueness, default credential relation and manual access tests. `SubscriptionService` only chooses the legacy command or internal resource adapter; credentials and repository identity live in separate services.

```mermaid
flowchart LR
  C[GitCredential] -->|nullable default| R[Repository]
  C -->|nullable override| S[Subscription]
  R -->|nullable repository_id| S
  S -->|repository backed| A[SubscriptionGitResolver]
  A --> H[gitSubscription internal helper]
  H --> G[GitCredentialResolver]
  G --> Q[Unchanged update.sh repo]
  S -->|legacy URL| L[Existing formatUrl and ql repo]
  L --> Q
  Q --> E[Ephemeral shallow clone]
  E --> P[Copy scripts and discover tasks]
  P --> T[Existing Task runtime]
```

```mermaid
erDiagram
  GitCredentials o|--o{ Repositories : "nullable default_credential_id"
  GitCredentials o|--o{ Subscriptions : "nullable credential_id override"
  Repositories o|--o{ Subscriptions : "nullable repository_id compatibility"
  GitCredentials {
    INTEGER id PK
    STRING name UK
    STRING provider
    STRING auth_type
    TEXT secret
    TEXT public_key
    TEXT known_hosts
    STRING capability
    STRING status
    DATETIME createdAt
    DATETIME updatedAt
  }
  Repositories {
    INTEGER id PK
    STRING name
    TEXT remote_url
    STRING normalized_url UK
    STRING provider
    STRING host
    TEXT path
    STRING owner
    STRING repository_name
    INTEGER default_credential_id FK
    STRING status
  }
  Subscriptions {
    INTEGER id PK
    INTEGER repository_id FK
    INTEGER credential_id FK
    STRING url
    STRING branch
    STRING alias UK
    JSON pull_option
    STRING schedule
  }
```

`Repositories` has no branch, clone path, bare store or worktree field. `normalized_url` is unique. Name changes do not change identity. `remote_url` is immutable after creation, to avoid silently changing transport and existing checkout spelling. Default credentials may change without changing repository ID. NULL means anonymous.

Status is `unknown` initially, `available` or `unreachable` after manual test. Authentication and network failures deliberately share a static failure message; no potentially secret-bearing remote error is returned. Lists query local DB only. Deletion is metadata-only and rejects referenced repositories; it never deletes subscriptions or filesystem paths.

Foreign keys use RESTRICT, and service operations check references transactionally. API `GET /api/repositories/:id` includes `subscriptions_count`.
