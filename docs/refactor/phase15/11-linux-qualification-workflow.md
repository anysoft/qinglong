# Linux Qualification workflow

`.github/workflows/linux-qualification.yml` is manual, read-only (`contents: read`),
Ubuntu 24.04 and fixed Node 22.23.2. It calls the existing Linux CI reusable workflow
with `scope: full`, preserving managed Runtime and both browser harnesses.
A separate native/scale/crash job uses `scripts/qualification/run.cjs`, composed
from the existing context, subprocess runner, preflight, scrubber and owned cleanup.

The runner records all six suite groups and continues collecting evidence after a
suite failure. Tests must be nonempty, all pass and have zero skipped cases.
Cleanup, collection and packaging failures make qualification fail. Final receipts
are repacked so archive and standalone summaries agree. An always-run finish step
recovers interrupted owned fixtures. Artifact upload uses `if-no-files-found: error`.

The summary runs even when dependencies fail. It checks Foundation's four real
jobs and uploads, raw TypeScript zero, actual test counts, identical commit SHA,
qualification run identity, Ubuntu 24.04/x64, each required suite, bridge IDs and
completion, critical source absence, collection, cleanup, packaging and upload.
Missing/ambiguous artifacts, skipped/cancelled dependencies, mismatched SHA and
failed final upload cannot produce PASS. Tests exercise failure paths.

No PAT, custom secret, permission increase, Docker push, tag or release is needed.
A passing Phase16A run on the entry SHA is not a Phase15 result. Local source must
be committed and a new full hosted qualification run must execute that SHA before
Phase15 can be declared PASS. This task does not push or dispatch remotely.
