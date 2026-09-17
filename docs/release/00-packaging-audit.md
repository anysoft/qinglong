# Phase16B packaging audit

Entry: 45a163bd; qualified functional source fc6bab97; Phase15 run 35121041296 PASS.

Retired four docker/Dockerfile variants, legacy entrypoint and compose: they cloned source
at build time, ran root, used /ql/data, PM2/crond, removed task.sh/update.sh, writable /app,
global language ENV and target-architecture-cross-copied dependencies. Git retains history.
Existing docker/build-manifest.cjs and verify-build.cjs remain build-evidence utilities.

Runtime owner inventory: compiled backend, frontend, shell Python syscall/lease helpers,
package metadata, version.yaml, production dependencies and LICENSE. No implicit SDK injection.
Actual server defaults: HTTP 5700, internal mTLS gRPC 5500 (loopback only in container).
Existing /api/health checks listening HTTP and internal gRPC; no new public route required.
App master shutdown ceiling currently 10 seconds; container stop budget 30 seconds is a
candidate margin and must be validated by acceptance before being called qualified.

Container blockers: mandatory root .env and root .tmp write. Minimal config changes accept
explicit JWT without .env and place temporary files under the data root. No schema change.
Restore atomically renames the data root and keeps control/candidates/quarantine next to it.
Mount /data and use DATA_DIR=/data/state; mounting DATA_DIR itself breaks restore (EBUSY).
No RestoreService redesign. BACKUP_DIR=/backup. HOME=/data/home.

Local engine discovery: Docker/Podman/Colima absent. Real container results remain pending.
