# Phase16B Resume Matrix

Resume 2026-09-17; develop, entry HEAD 45a163bd. No existing Phase16B commit.

LAST_VERIFIED_POINT: Phase15 hosted PASS; existing release unit tests 3/3 PASS.

FIRST_INCOMPLETE_POINT: real Docker build and runtime acceptance. Colima Linux arm64 available; Buildx missing, Compose plugin undiscovered.

All existing release source is recovered work, not container qualification evidence. Snapshot: diagnostics/phase16b/resume-snapshot.md.

| Area | Existing | Status | Evidence | Remaining |
|---|---|---|---|---|
| Phase15 freeze | Phase15 report | DONE_VERIFIED | Run 35121041296 | Preserve freeze |
| Dockerfile | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| Docker build | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| runtime image | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| non-root | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| DATA_DIR | Recovered source; see snapshot | PARTIAL | No real container PASS evidence | Verify actual behavior and close missing gates |
| BACKUP_DIR | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| HOME | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| permissions | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| startup entrypoint | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| PID1 | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| tini/init | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| SIGTERM | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| graceful shutdown | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| healthcheck | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| readiness | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| Compose | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| Managed Python | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| Managed Node | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| Python Environment | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| Node Environment | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| host runtime fallback protection | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| persistence | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| restart | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| SIGKILL recovery | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| backup/restore container test | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| amd64 | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| arm64 | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| Buildx | Recovered source; see snapshot | BLOCKED | No real container PASS evidence | Verify actual behavior and close missing gates |
| container security | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| image secret scan | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| vulnerability scan | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| SBOM | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| provenance | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| versioning | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| OCI labels | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| container qualification workflow | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| release workflow | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| DockerHub | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| GitHub Release | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| release manifest | Recovered source; see snapshot | NOT_STARTED | No real container PASS evidence | Verify actual behavior and close missing gates |
| checksums | Recovered source; see snapshot | DONE_NOT_VERIFIED | No real container PASS evidence | Verify actual behavior and close missing gates |
| documentation | Recovered source; see snapshot | PARTIAL | No real container PASS evidence | Verify actual behavior and close missing gates |
| PHASE16B_REPORT | Recovered source; see snapshot | NOT_STARTED | No real container PASS evidence | Verify actual behavior and close missing gates |

## File classification

Existing Dockerfile, compose, release scripts, workflows, config/version edits: PARTIAL pending actual qualification. Existing release tests: COMPLETE for their limited three assertions. Diagnostic logs: GENERATED, retained. Retired Docker files: intentional packaging changes, preserved in Git history. No unrelated changes identified.

## Data layout conflict

Recovered implementation uses DATA_DIR=/data/state, with volume mounted at /data. Latest request specifies DATA_DIR=/data. Existing atomic restore renames DATA_DIR; a volume mountpoint cannot be renamed. User explicitly approved /data/state with the persistent volume mounted at /data on 2026-09-17.
