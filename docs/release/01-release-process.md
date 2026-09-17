# Release process

Phase16B stops at a local candidate commit until push/tag/publication are explicitly authorized. Qualification is not publication. Phase15's hosted run 35121041296 qualified fc6bab97d5abfd96f51a952ac04516e5bd6d85cb; it does not qualify new container code.

## Required repository configuration

| Setting | Use |
|---|---|
| vars.RELEASE_BRANCH | Explicit approved branch ancestry, for example develop |
| vars.DOCKERHUB_USERNAME | Docker Hub service account/user |
| vars.DOCKERHUB_IMAGE | namespace/repository |
| secrets.DOCKERHUB_TOKEN | Scoped Docker Hub token; never account password |
| GITHUB_TOKEN | Built-in publish-job token for GitHub Release; no PAT |

Container Qualification needs contents:read and no custom secrets. It reuses Linux Qualification, builds each target on its native Ubuntu 24.04 runner, performs actual managed-runtime, persistence, recovery, restore and Compose acceptance, validates OCI layers/attestations and rejects fixable CRITICAL vulnerabilities. Missing evidence or failed cleanup blocks publication.

After authorization, push the candidate and inspect hosted receipts for the exact SHA. Only then prepare an authorized strict version tag matching package.json on the approved branch. The tag workflow repeats qualification for that exact source. Ordinary branch pushes never publish.

The publish job receives the exact qualified per-architecture OCI archives, verifies archive transport hashes and source identity, and promotes them with skopeo --all --preserve-digests. It creates the multiarch index without rebuilding images, verifies per-platform and attestation digests plus every tag alias, pulls and smoke-tests the published version, then creates checksummed GitHub Release assets. Only the publish job gets contents:write. BuildKit attestations do not require GitHub attestation or OIDC write permissions.

A partially failed publication is not PASS. Inspect existing tags/assets and qualification receipts before a controlled retry. Never overwrite release identity to conceal different bytes. Do not mark Phase16B PASS until the actual registry and GitHub Release checks succeed.
