# Discovery boundary

SubscriptionDiscoveryAdapter receives the locked worktree, a private stage, policy and a DB task projection. It never clones, reads live crontab.list, calls HTTP or owns database access.

Identity is (sub_id, discovery_key = SHA256(source_relative_path)). Crontab remains B15. Name/cron/command updates retain task ID, hooks, disabled state and ENV binding; discovery_definition records the last source definition so user edits survive future scans.

Default extensions: js/mjs/py/sh/ts. Explicit comment metadata: `cron:` and `name:`. No schedule produces NO_CRON_METADATA and no automatically created task. No new Env scraping, random schedule, template eval or colon payload.

Private same-filesystem staging and previous-version rename remain B01. CronService validates ownership and schedules, checkpoints prior definitions and compensates DB, scheduler and files. Recovery failure retains private material. crontab.list is scheduler output only for Discovery purposes.

Validation: adapter filters/nesting/policy/symlinks, complete Git pipeline, copy/network/DB/scheduler failures and retry. A regression found SQLite raw JSON projection bypassing model decoding; loading plain model values fixed source update reconciliation (step3-update-retest.log).
