# Phase 16B Status: PARTIAL

## Resume

Branch `develop`; entry HEAD `879544049d929eb99c835ff4b45b11ffef56b078`. Phase15 and Phase16A remain PASS. Existing Phase16B changes and failure evidence were preserved without reset, clean, stash, Docker prune, push, tag or publication.

## arm64 result

`ARM64_FULL_ACCEPTANCE_PASS`

One clean run completed every arm64 gate from fresh installation through restore and cleanup:

- fresh non-root, read-only, capability-dropped container and health
- account initialization, version, repository/worktree/local Git commit and Shell
- Python 3.13.15, Python environment and managed Python task
- Node 24.21.0, NPM, PNPM 10.34.5, CJS, ESM and TSX
- missing managed runtime fail-closed and replacement-container persistence
- graceful stop and SIGKILL runtime, notification and task recovery
- encrypted portable backup
- restore into a different fresh DATA volume
- fresh unauthenticated post-restore login
- explicit runtime rebuild and restored Python, Node, TS and Shell execution
- owned resource cleanup

Evidence: `release-output/arm64-full-clean-final/acceptance.json`; log: `diagnostics/phase16b/container-acceptance-arm64-full-clean-final.log`. Result `PASS`, cleanup `PASS`, no failure. The tested image configuration digest is `sha256:ee20e65b773bd87f81ffcc8a8d57b6cac40fbd3a6688da922f144ac6bb6f6132`.

## Repairs completed

### PNPM verifier

Missing dependency paths are accepted only when trusted parent package metadata declares the dependency optional. Required missing packages and unsafe paths remain fail-closed. Regression 7/7 PASS.

### Python download policy

The isolated curl policy keeps TLS validation and bounded retries while allowing one slow transfer up to 900 seconds. Python 3.13.15 download, compile, install and verify passed in the final clean run.

### Restore authentication harness

Classification: `ACCEPTANCE_HARNESS_BUG`. The restore harness retained the pre-restore token after importing source state into a target volume with its own JWT signing secret. `login()` now clears authentication before every credential login, and container restart refreshes the dynamically published Colima port. Focused encrypted backup → fresh-volume restore → fresh login passed.

Security regression: login without token 200; protected API with valid token 200; protected API without token 401; protected API with a correctly signed expired token 401. No expiry or product authentication rule was weakened.

### Execution finalization under clock adjustment

Repeated focused execution exposed short Colima wall-clock regressions: an attempt could finish hundreds of milliseconds before its recorded start, violating the negative-duration database guard after the main process had succeeded. Attempt elapsed time and completion timestamp now derive from `node:perf_hooks` monotonic time anchored to the starting wall clock. Hardening tests 9/9 PASS; 41 consecutive focused container tasks PASS; TypeScript 0 errors.

GitNexus `detect_changes` reports HIGH aggregate risk because the final change touches core execution flows (14 affected flows). This risk was exercised by the hardening suite, repeated focused finalization test and the complete arm64 acceptance run.

## Image and supply-chain evidence

arm64 image build, SBOM, max-mode provenance, OCI audit and daemon config-byte identity check passed. The build used pinned local base/scanner digests because Docker Hub metadata routing was unavailable; the image bytes and attestation generator were fixed by digest.

Historical PNPM, Python timeout, stale-token, dynamic-port and execution-finalization failures remain in their original `release-output/` and `diagnostics/phase16b/` paths.

## Pending

Phase16B remains `PARTIAL` until amd64 qualification and the remaining release-engineering gates are complete. Vulnerability scan, Compose acceptance, hosted multi-architecture qualification, registry promotion and GitHub Release are not claimed.

## Safety boundary

No push, tag, Docker Hub publication or GitHub Release was performed. No user Docker resources were pruned. The approved layout remains volume `/data`, `DATA_DIR=/data/state`, separate `/backup`, and controlled `/data/home`.
