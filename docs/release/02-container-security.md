# Container security

The build context is allowlisted: no .git, local .env, diagnostics or test fixtures. Each target compiles native addons itself. Production runs as UID/GID 10001, Tini forwards signals, the application root is read-only, and writes are confined to persistent data/backup and temporary paths. No Docker socket or host namespace access is granted.

The persistent JWT secret is generated at first startup outside the immutable image and live restore root, with exclusive creation, fsync and restrictive ownership/mode checks. Do not include volumes, task logs, encrypted backups or credentials in release artifacts. Secrets should never be build arguments.

OCI validation checks configuration identity and every layer, including deleted files, for source/state/private-key/JWT patterns. This pattern scan is bounded detection, not proof that arbitrary unknown secrets cannot exist. Context allowlisting supplies the primary isolation boundary. Retain docker history inspection as a separate gate.

The pinned scanner download is checksum verified. The vulnerability gate blocks fixable CRITICAL findings and malformed/empty scanner receipts. No blanket suppression is allowed. Fixing production dependency findings requires a focused change and rerun of the relevant qualification. Scanner database availability is a gate, not grounds to silently pass.

Task code is user-controlled and executes with the platform identity. This container is not a multi-tenant sandbox against hostile task authors. Restrict administration accordingly. Backup passphrases and portable exports must be stored separately.

## Public self-test vectors

Debian GnuTLS embeds nine public PEM known-answer keys from [upstream crypto-selftests-pk.c, tag 3.7.9](https://github.com/gnutls/gnutls/blob/3.7.9/lib/crypto-selftests-pk.c). The audit allows only their exact PEM SHA-256 values in the expected architecture-specific libgnutls shared-library path. It records every match. Unknown keys still fail; no library/directory-wide scan exclusion applies. Header strings without key material are not treated as private keys.
