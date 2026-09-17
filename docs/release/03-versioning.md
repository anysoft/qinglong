# Version identity

package.json version is canonical. The release tag must be exactly v plus this version, validated as strict SemVer. Build metadata carries source SHA, version, build timestamp and lockfile digest; OCI labels must agree. Release manifest identifies the registry multiarch manifest digest and actual supported platforms. An OCI archive transport checksum is not the registry image identity.

Stable 1.0.0 publishes 1.0.0, 1.0, 1, latest and sha-<full SHA>. Prerelease 1.0.0-rc.1 publishes only the exact prerelease and sha-<full SHA>; it never updates stable aliases. Version mismatch, malformed tags or wrong branch ancestry fail closed.

RELEASE_ENGINEERING_IMPLEMENTED describes code completion. LOCAL_CONTAINER_QUALIFICATION_PASS requires actual local acceptance. HOSTED_CONTAINER_QUALIFICATION_PENDING remains until hosted results exist. RELEASE_READY requires hosted qualification and still does not mean RELEASED. Phase16B PASS / PLATFORM_1_0_RELEASED requires actual publication and post-publication verification.
