# Docker deployment — Platform 1.0 candidate

This packaging is under Phase16B qualification. No Platform 1.0 image has been published by this task. Read PHASE16B_REPORT.md for actual qualification status. Do not substitute an upstream QingLong image: its storage and execution contracts differ.

## Start from a verified release

Download compose.yaml and .env.example from the same verified GitHub Release. Check SHA256SUMS before use. Copy .env.example to .env, set DOCKERHUB_IMAGE from release-manifest.json, and select its exact PLATFORM_VERSION. Then:

```sh
docker compose config --quiet
docker compose pull
docker compose up -d --wait
docker compose ps
```

Open http://127.0.0.1:5700 and create the first administrator. The port is loopback-only by default. Configure an authenticated TLS reverse proxy if remote access is required. Internal gRPC is loopback-only inside the container and is not published.

## Storage and identity

| Path | Responsibility |
|---|---|
| /app | Immutable application and production dependencies |
| /data | Persistent named volume; owned by UID/GID 10001 |
| /data/state | DATA_DIR; database, repositories, worktrees, managed runtimes and environments |
| /data/state.platform-control | Restore staging, journals and recovery control |
| /data/home | HOME; controlled Git/runtime home |
| /data/.platform-jwt | Persisted private JWT signing secret, mode 0600 |
| /backup | BACKUP_DIR; separate persistent backup volume |
| /tmp | Temporary writable tmpfs, removed with container |

The /data/state layout was explicitly approved during resume. Restore atomically renames the live data directory. Mounting a volume directly at DATA_DIR would prevent that operation; mount the parent /data instead. Run exactly one active instance per data volume. Never share a live SQLite data directory between replicas.

Named volumes inherit the image's non-root directory ownership. For administrator-provided bind mounts, prepare UID/GID 10001 access yourself; startup deliberately does not recursively chown user data. The platform process runs as 10001:10001 with all capabilities dropped, no-new-privileges and read-only root. Docker socket, privileged mode, host PID and host networking are unnecessary.

## Managed tasks

App Node runs the platform only. Task Python and Node must use installed Managed Runtimes and built Dependency Environments. System Python exists for platform filesystem/process helpers and compilation, not as a Task fallback. Install the provider/runtime, create and build an environment, bind it to a Task, and check readiness before executing. Compiler and development libraries remain in the image so CPython and native dependencies can build as non-root.

## Stop, upgrade and recover

Use docker compose stop (30-second grace period) before maintenance. Before upgrades, create a platform backup and encrypted portable export, copy it outside the Docker host, and retain its passphrase separately. A backup volume alone is not protection against host loss. Avoid docker compose down --volumes: it deletes data.

For an upgrade, stop, preserve backup/export, pull the exact qualified version, and start against the existing volumes. Schema v9 is unchanged by this packaging. Arbitrary downgrade is not guaranteed; use a compatible image and a separate verified restore if rollback is needed.

Portable restore imports logical runtime/environment records but deliberately excludes physical runtime installations. Complete the restore/restart procedure, verify tasks are not ready, then explicitly rebuild runtimes/environments before executing. Keep exported backups outside the source data volume.

## Verification and platforms

The target matrix is native linux/amd64 and linux/arm64. Hosted qualification for both architectures is required before advertising multiarch release support. Colima on Apple Silicon can validate native arm64 locally; emulated amd64 cannot replace hosted native results. HEALTHCHECK calls /api/health; first startup may take up to the configured health start period. Inspect docker compose logs for startup failures, taking care not to publish user task output or credentials.
