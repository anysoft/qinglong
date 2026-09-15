# Credential security boundary

## Secret storage audit

The Phase 0 codebase has no credential vault, master-key service or reusable encryption-at-rest helper. Existing login password hashing is not reversible secret storage. `CredentialSecretService` therefore stores explicit plaintext JSON in SQLite, exposes get/set/hasSecret, and is the single replacement point for future encrypted storage. Database backups contain secrets and need the same protection as the database. No weak home-grown encryption is introduced.

New resource DTOs never expose secret JSON, token, private_key or passphrase. The ORM default scope excludes secret; service writes refetch public metadata. UI offers retain/replace and never requests original secret. API input is whitelisted, validation errors are static, SQL/process errors are not forwarded. Resource URLs reject HTTPS userinfo and SSH passwords. Admin-supplied display metadata is not itself a secret field; do not put secret material in names or known_hosts.

## Execution context

- Unique mkdtemp per invocation, directory 0700; token JSON, SSH key and known_hosts files 0600.
- Nonsecret executable askpass helper is 0700 because the OS must execute it; it reads the 0600 JSON and contains no embedded secret.
- Token/passphrase is not in argv, remote URL or environment values. Askpass supplies it only when Git/OpenSSH requests authentication.
- New Git runs from its private directory, without inherited GIT_* tracing/config, SSH_AUTH_SOCK or SSH_ASKPASS. System/global Git config and persistent credential helpers are disabled. HTTPS redirects are disabled to prevent credential redirection.
- SSH uses a private IdentityFile, `-F /dev/null`, IdentitiesOnly and StrictHostKeyChecking=yes with supplied UserKnownHostsFile. No automatic keyscan trust. Anonymous SSH also needs verified known_hosts and disables default identity files.
- Each process owns a group; timeout/cancellation terminates its descendants. `finally` removes files on success and failures, including helper cancellation while preparing its context. Abrupt SIGKILL, host crash or power loss cannot run finally; no claim of crash-proof secret-file erasure is made.
- Updating a credential does not mutate a running invocation's snapshot. Next invocation uses the new secret.

## Existing SshKeyService boundary

The legacy service maintains persistent HOME/.ssh/ssh.d configuration and disables strict host checking. Reusing that execution path would violate the Phase 1 security contract. It remains solely for non-repository subscriptions; new resolver owns short-lived files and enforced host checks. There is no automatic deletion/migration of old SSH files or old embedded URL credentials.

## Redaction and API access

`redactGitCredential` masks known token/private key/passphrase strings, URL-encoded and base64 forms, credentialized URLs, authorization headers and private PEM blocks. Whole-output capture handles secrets split across output chunks; overflow produces only a static notice. It cannot guarantee detection of arbitrary adversarial encodings or deliberate disclosure by administrator-authored hooks. The new secret context is not passed to existing before/after hooks.

New `/api/repositories`, `/api/git-credentials` and conversion routes run behind existing panel authentication. They explicitly reject original `/open/` URLs, including custom app scopes. Existing /open endpoints and subscriptions scope behavior remain unchanged. This phase does not grant new app scopes. Access tests run only ls-remote and return static status messages; list operations never contact remotes.

READ/WRITE metadata is an application operation gate, not a replacement for least-privilege server-issued credentials. No push endpoint is introduced.
