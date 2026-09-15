# Subscription compatibility contract

`repository_id` and `credential_id` are nullable additions. Existing `url`, `branch`, `pull_option`, `pull_type`, `alias`, schedules, filters, hooks and auto task switches remain.

Resolution order is subscription override → repository default → anonymous. Missing or disabled selected credentials fail closed; no fallback to another identity. An override without a repository is invalid. File subscriptions cannot be repository backed. Credential transport must match the stored remote.

Legacy subscriptions still call the original formatUrl/formatCommand and SshKeyService. New subscriptions schedule an internal helper command containing only subscription ID and executable paths. The helper reads current repository/credential metadata when execution starts, snapshots secret material into a unique private context, and invokes `/bin/bash shell/update.sh repo` with the original positional arguments. Cron and interval scheduling, before/after hooks, queue, task discovery and task runtime stay in their original services.

The helper does not implement clone or copy logic. Existing shell still removes the old checkout, performs `git clone --depth=1`, copies scripts and calls task APIs. Branch is still a subscription field, including branch-specific directories. The old shell's exit-code behavior is retained: update.sh ultimately exits 0 even when a clone logs failure. Resource access tests report git's actual exit status independently.

## Alias audit and collision warning

Alias remains the subscription's unique DB field, log directory, legacy SSH alias and existing removal-related key. It is never repository identity. Source: subscription model; service taskCallbacks/remove/setSshConfig; config/subscription; services/sshKey; subscription UI modal; shell/update.sh:get_uniq_path.

`legacyCheckoutName` mirrors the current shell naming calculation, without replacing it. Create/update API returns a top-level `warnings` array if other subscriptions resolve to the same legacy clone directory. Conversion returns warnings with its subscription. Warnings contain subscription IDs, not secrets. UI displays them. There is deliberately no locking, lease or automatic rename. Same URL and branch can still overwrite each other's ephemeral checkout; Phase 2 must solve ownership.

## Observable additions / limits

New-path logs are captured (up to 4 MiB), redacted across chunks, then forwarded through the existing subscription logging callbacks. They are not streamed live. On overflow the entire captured body is omitted to avoid leaking a truncated secret. Git access test timeout is 30 seconds; new helper timeout is one hour; no old timeout policy changes. Contexts isolate Git config, helper/agent inheritance and redirect behavior; they do not change global task ENV.

New runtime safety validation rejects unsupported branch/proxy/extension/path inputs before they reach the unchanged shell. This does not tighten legacy input grammar. Remote authority, credential source and safe credential execution context are the only new pipeline components. Task/shallow clone/copy/scanner implementation files are unchanged.
