# Phase 16B Status: PARTIAL

## Source Freeze

- Entry HEAD: `879544049d929eb99c835ff4b45b11ffef56b078`
- ARM64 source freeze: `fd09a3c83945f817342e34c80e61811ec5945d2b`
- Dependency repair: `904296072b9149f19b2fdaa3b212aa7515fa0c0f`
- Final qualified source: `4d3d1915691cdc3ef53046ba22c733656f433737`
- Tracked worktree: clean after source commits; local outputs and logs remain untracked evidence.

The original ARM64 freeze did not change qualified bytes. Later security commits changed dependencies and the runtime image, so both architectures were rebuilt from the final commit.

## ARM64

Mode: native Linux ARM64 under Colima.

- Build and architecture (`aarch64`, Node `arm64`, UID 10001): PASS
- Managed Python 3.13.15, Node 24.21.0, NPM and PNPM 10.34.5: PASS
- Full acceptance and cleanup: PASS

The clean run passed startup, Repository/Worktree/Git, Shell, all managed runtimes and script formats, host-runtime fail-closed, persistence, graceful shutdown, all SIGKILL recovery gates, encrypted backup, fresh-volume restore, fresh login, runtime rebuild and restored execution.

Evidence: `release-output/arm64-security-final/acceptance.json`; log: `diagnostics/phase16b/container-acceptance-arm64-security-final.log`.

- Image ID: `sha256:8b9623ae48adfa49c2ec77f88e66d162ad524141aeb796591c49fdc3b6644ba1`
- Manifest: `sha256:478c10cd90e0846915e01ac8fda3c4a3debd5e88a6657b094bdddcbda4e517d9`
- Config: `sha256:e1e4de912067e6bfd37683df48ed5f93dd7b852d0e9a69337e093519aa4f1079`

## AMD64

Mode: `LOCAL_AMD64_EMULATED` on an ARM64 macOS host.

- Clean build, x86_64/Node x64 architecture, target-native SQLite addon and static gates: PASS
- Managed Node 24.21.0 Linux x64 and PNPM 10.34.5 install/verify: PASS
- Full local acceptance: `LOCAL_AMD64_EMULATION_LIMITATION`

The full emulated run reached managed CPython installation before repeated runtime lock failures under sustained QEMU load. Two clean Node-focused runs on the final image reached successful Node and PNPM verification, then failed at environment build/polling with `PLATFORM_BACKUP_IN_PROGRESS` or `RUNTIME_LOCK_FAILED`. Containers stayed healthy at roughly four emulated CPUs. Product behavior was not changed for QEMU. Native full AMD64 acceptance remains assigned to GitHub Hosted Ubuntu 24.04 x64.

Evidence: `release-output/amd64-security-final/node-focused.json` and `diagnostics/phase16b/container-node-focused-amd64-security-final*.log`.

- Image ID: `sha256:313bf9a42bca5f147deb1319faf081f31eac14870aa5bdb08fd9a028b08b6fde`
- Manifest: `sha256:86ab3817440f119ab9620d88899d4d36d292c2bbc05ab68e7ca092e1bcf0e355`
- Config: `sha256:c6c96f9448f966e820a41ddab25a283eee365190e422bc00b1cf469fdbb5cf4e`

## Compose

- Config, fresh up/health, named-volume restart and cleanup: PASS
- Source and `node_modules` binds, Docker socket, privileged mode and host network: absent
- Volumes: `/data` with `DATA_DIR=/data/state`, and separate `/backup`

Evidence: `release-output/amd64-security-final/compose.json` and `compose-config.yaml`.

## Vulnerability

Trivy 0.73.0 used a freshly downloaded database. Initial scans found fixable CRITICAL issues in `protobufjs`, application `tar`, `websocket-driver`, and npm's bundled `tar`. Application dependencies were pinned to fixed versions; the image now pins npm 11.19.1 with `tar` 7.5.22.

Final raw scans contain only `CVE-2026-55445` against the retained identity `@whyour/qinglong@1.0.0`. It applies to upstream code that permits unauthenticated `/open/user/init`; this source guards both `/api/user/init` and `/open/user/init` before rewrite. `.trivyignore` records that route-level rationale.

- ARM64 unhandled fixable CRITICAL: 0
- AMD64 unhandled fixable CRITICAL: 0
- Gate: PASS

Raw and adjudicated JSON reports are retained in each final architecture output directory.

## SBOM / Provenance

Both images passed SBOM, max provenance, OCI audit, secret scan, label/source identity and loaded config-byte identity. Local builds fixed the base image and SBOM scanner by digest.

## Hosted Qualification

`.github/workflows/container-qualification.yml` is ready with Phase 15 dependency, native Ubuntu 24.04 AMD64 and ARM64 jobs, full acceptance, Compose, security and summary gates. Permissions are `contents: read`; no registry credential or publication permission is required.

Hosted qualification is PENDING because no push was authorized or performed.

## Phase16B

`PARTIAL`

- `ARM64_FULL_ACCEPTANCE_PASS=YES`
- `AMD64_LOCAL_QUALIFICATION=LOCAL_AMD64_EMULATION_LIMITATION`
- `COMPOSE_ACCEPTANCE=PASS`
- `VULNERABILITY_GATE=PASS`
- `HOSTED_CONTAINER_QUALIFICATION=PENDING`
- `RELEASE_ENGINEERING_IMPLEMENTED=YES`
- `PLATFORM_1_0_RELEASED=NO`

Phase16B cannot be PASS until native hosted qualification succeeds and the separately authorized v1.0.0 release is published.

## Git

- Qualified image source commit: `4d3d1915691cdc3ef53046ba22c733656f433737`
- Push: NOT PERFORMED
- Tag: NOT PERFORMED
- Docker publication: NOT PERFORMED
- GitHub Release: NOT PERFORMED
