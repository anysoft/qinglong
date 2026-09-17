# Phase 16B Status: PARTIAL

## Resume

Branch `develop`; entry HEAD `45a163bd`. Phase15 hosted qualification remains PASS at run `35121041296`, SHA `fc6bab97d5abfd96f51a952ac04516e5bd6d85cb`. Existing Phase16B work was recovered without reset/clean/stash. The resume snapshot and matrix are [here](diagnostics/phase16b/resume-snapshot.md) and [here](docs/release/phase16b-resume-matrix.md).

## Verified in this session

- Colima context is usable with Docker Engine Linux arm64. Docker CLI plugins were installed from Homebrew: Buildx 0.37.1, Compose 5.5.1, Skopeo 1.24.1.
- arm64 OCI image built with target-native dependencies, SBOM and max-mode provenance.
- Layer/config audit passed after explicit review of Debian GnuTLS public self-test vectors. No unknown private key/JWT/source-state pattern passed.
- Image loaded into the Colima daemon with Linux/arm64 override; configuration bytes are compared from the raw daemon config.
- Fresh smoke passed: health, non-root UID 10001, read-only root, dropped capabilities, bootstrap account and version API; owned cleanup passed.
- Focused release/provenance tests: 7/7. Full platform run: 384/385; its single retired-Docker-path assertion was corrected and passed focused revalidation. No subsequent full 385/385 run is claimed.
- Isolated download environment regression: 1/1; a real child receives fixed HTTP/1.1 and bounded curl retries, without inheriting host curl options or backend secrets.
- TypeScript check: 0 errors.

## Pending

PNPM optional dependency verifier fix: PASS. Focused Managed Node 24.21.0 + PNPM 10.34.5 build/verify: PASS; fsevents omission classified from parent metadata. Regression tests: 7/7; TypeScript: 0 errors. Fresh arm64 runs passed PNPM, Node/ESM/tsx, missing-runtime fail-closed and replacement persistence gates. The latest clean run failed at Python 3.13.15 source download after three bounded curl attempts timed out (curl 28, partial 4–5 MB/23 MB); cleanup passed. Full qualification must complete managed Python/Node environments, CJS/ESM/tsx/Shell, persistence, graceful stop, SIGKILL runtime/notification recovery, encrypted portable restore and explicit rebuild. amd64 native build/acceptance and hosted qualification remain pending. Vulnerability scan, Compose acceptance, final gate aggregation, registry promotion and GitHub Release are not claimed.

## Safety boundary

Latest continuation: the image rebuilt successfully, passed OCI audit/config identity checks, and a real container confirmed the compiled build environment supplies the curl policy. Focused and full acceptance evidence is stored under `release-output/pnpm-fix-arm64-*`; earlier failures are archived under `release-output/history/`. The latest full report is `release-output/pnpm-fix-arm64-release/acceptance.json` and remains FAIL solely at Python source download; all owned resources were cleaned.

No push, tag, Docker Hub publication or GitHub Release was performed. No user Docker resources were pruned. The approved container layout is volume `/data` with `DATA_DIR=/data/state`, separate `/backup`, and controlled `/data/home`; this preserves atomic restore semantics and was explicitly accepted during resume.
