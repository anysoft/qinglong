# Platform startup and internal operations

## Fresh startup

Prepare the documented platform prerequisites (Node 22 build host, Python 3 for native helpers,
Git, Bash, SQLite and OS build tools), install project dependencies using the locked package
manager, create a private `.env` from `.env.example`, and configure an installation-specific
JWT secret. Build backend/frontend, then start with an absolute dedicated `QL_DATA_DIR`:

```sh
pnpm build:back
pnpm build:front
QL_DATA_DIR=/absolute/platform-state pnpm start:platform
```

`scripts/platform/start.cjs` launches the built backend in the foreground with fixed argv,
forwards TERM/INT and propagates its exit status. The backend owns bootstrap, account initialization,
leases and restore recovery. A service manager may supervise this command; restarting means stopping
and starting that supervised process. Existing PM2 metadata remains available for operators.
No startup command installs global Python/Node packages, copies SDKs, grants 0777, sources user
shell files, downloads a release, or changes system nginx/package configuration.

Ubuntu prerequisite installation used by qualification is explicit in
`scripts/ci/install-system.sh`; it is not a Task dependency installer. Task dependencies must be
created through Python/Node Environment revisions and Builds. Package indexes/toolchains are
configured by those resource contracts. OS packages and platform upgrades are operator maintenance.
The old in-panel code-overwrite/reload/dependency-mirror operations and npm `ql`/`task`/`qinglong`
bins have been removed. This phase does not implement release distribution.

## Logs and notifications

`logRemoveFrequency` is a validated 0–3650-day subscription-log retention setting; 0 disables it.
An enabled policy checks hourly. Manual preview/cleanup uses `/system/storage-retention` and an
explicit `CLEAN` confirmation. Only generated `subscription-ID/YYYY-MM-DD-HH-mm-ss.log` files are
candidates; active/queued subscriptions, symlinks, user filenames and TaskRun logs are excluded.
System logs rotate through Winston (7 days). TaskRun automatic deletion remains disabled.

Backend system/login notifications retain their explicit typed provider contract; authenticated
`/system/notify` and mTLS `SystemNotify` may request delivery. Task terminal notifications use
Channel/Policy/Outbox/Delivery. `sample/notify.js` and `.py` are optional, explicitly imported
source examples. Operators must declare their dependencies in the chosen environment. There is
no automatic copy to Worktree/scripts/preload, global QLAPI injection or TLS downgrade.

## Qualification and scope

Run `node scripts/qualification/run.cjs` on prepared Ubuntu 24.04 with a fresh owned CI context;
GitHub's Linux Qualification workflow composes the same runner with Foundation `full`.
Darwin results are local regression evidence only. Docker image/entrypoint templates are outside
this qualification and still require the separately authorized Phase16B review before use with
this source tree. No Docker release, tag, deployment or container compatibility claim is made.
