# Platform 1.0 Functional Architecture — Frozen

Qualified source: `fc6bab97d5abfd96f51a952ac04516e5bd6d85cb`.
Hosted Ubuntu 24.04.5 x64: [Linux Qualification 35121041296](https://github.com/anysoft/qinglong/actions/runs/35121041296).
Functional schema: v9. Temporary bridges: 0. TypeScript errors: 0.
Foundation 385/385; additional qualification 118/118; zero failures/skips.

The architecture documents at the qualified source define the Platform 1.0 functional baseline:
Repository → Worktree → Task → TriggerEvent → ExecutionResolver → immutable ExecutionContext
→ Runner v2 → TaskRun/Attempt → Logs/Outbox/Delivery.

Phase16B is not started. Its scope is packaging, containerization, release metadata and
startup packaging fixes. Task, Runtime, Trigger, Execution, Workspace and Backup domain
redesign requires a demonstrated release blocker and an explicit scope decision.

## Phase16B inputs only

- Docker startup entrypoint (existing templates are not qualified), multi-stage build, non-root execution.
- Runtime build prerequisites, volume ownership, DATA_DIR and BACKUP_DIR.
- Healthcheck and graceful shutdown; amd64 and arm64.
- DockerHub/GitHub Release, checksums, SBOM and provenance.

No image build/publication, release, tag, signing or deployment is authorized by this freeze.
Qualification fixture sizes are evidence, not production throughput guarantees.
