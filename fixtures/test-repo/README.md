# Phase 0 repository fixture

Local-only input. Tests copy this tree to a temporary Git repository, commit locally,
and use file:// clones. No package installation or external Git service is required.

- python/example.py, node/example.js, shell/example.sh: cron/name metadata and ENV output.
- nested/annotated.js: basename-only cron annotation intentionally characterizes the
  current nested-path fallback; new Env text supplies the display name.
- node/package.json and requirements/requirements.txt: empty dependency manifests.

Do not run fixtures against a real QingLong data directory. Test harnesses substitute
only status/notification/API boundaries, preserving Git/scanner/task shell behavior.
