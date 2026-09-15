# Legacy Git removal

Removed update_repo, update_raw, duplicate scanner, git_clone_scripts, ql repo/raw/bot dispatch, Bot startup/config and unused Shell HTTP task publication helpers. Removed global SSH alias private-key setting/service/startup and ssh.d bootstrap; Repository Credential SSH uses private contexts and strict host verification.

Kept platform update/reload/check/reset/rmlog and notification SDK. No existing user directory was deleted. Fresh bootstrap and Shell fix_config no longer create repo/raw.

Validation: 65/65 Credential/normalization/Repository/Worktree/locks/recovery/Subscription/Fresh tests, backend build, bash syntax checks. Git URL normalizer local variable names repoPath/rawPath describe URL segments, not filesystem ownership. Imports of data/repository are core model references.
