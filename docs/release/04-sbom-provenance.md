# SBOM and provenance

Buildx exports OCI with SBOM and max-mode provenance. Each platform archive must contain SPDX and SLSA attestations associated with its exact image manifest. Qualification retains the archive, extracted attestations, per-layer scan receipt, config/manifest digests and acceptance evidence.

The classic Docker daemon store can discard attestations when loading an image. Acceptance loads the executable image and checks its configuration digest; publication uses the preserved original OCI archive, not a new docker save/rebuild. Skopeo preserves image and attestation digests, and registry verification checks them in the published index.

GitHub Release includes per-architecture SBOM/provenance, qualification receipts, compose.yaml, .env.example, release-manifest.json and SHA256SUMS. Download verification checks asset hashes. The registry manifest digest in release-manifest.json is the image identity. Cosign is optional and no static signing key is introduced.
