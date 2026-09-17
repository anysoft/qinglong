# PNPM environment verification failure

## Acceptance evidence

Source: `release-output/isolated-download-arm64/acceptance.json`.
Overall FAIL; cleanup PASS. Operation 11, `/runtime/node/environments/2/build`,
failed with `RUNTIME_MISSING` after PNPM emitted its dependency graph.
The retained graph includes paths for foreign-platform esbuild optional packages.

## Focused Docker reproduction

Executed in `platform-candidate:arm64` using a temporary, automatically removed
container without persistent volumes. Installed PNPM 10.34.5 and a project with
`is-number@7.0.0` and `tsx@4.20.5`, then traversed
`pnpm list --json --depth=100` and tested the listed paths.

Observed first missing package: `fsevents@2.3.3`.
Its parent `tsx` declares it in `optionalDependencies` as `~2.3.3`.
The graph supplied a path ending in
`node_modules/.pnpm/fsevents@2.3.3/node_modules/fsevents` although that path did
not exist. `fs.realpathSync` raised `ENOENT`.

This reproduction used the image's application Node 22, whereas acceptance used
managed Node 24.21.0. It confirms the PNPM graph/path failure mechanism; the
truncated acceptance log does not identify the exact first missing package.

## Code trace and repair boundary

`back/services/nodePackageManager.ts` unconditionally calls `fs.realpath` for
each dependency graph item with a path. Its optional-placeholder exception is
NPM-only. `back/services/runtimeOperations.ts` maps uncategorized `ENOENT` to
`RUNTIME_MISSING`, masking the dependency-path cause.

The repair must recognize legitimately omitted PNPM optional dependencies using
trusted dependency metadata, while retaining failures for missing required
packages and unsafe paths. Blanket suppression of ENOENT is inappropriate.

## Production fix and verification

The verifier now reads optional dependency declarations from the validated parent
package manifest. Missing paths are ignored only when that metadata declares the
child optional; required missing paths produce `NODE_DEPENDENCY_MISSING` and
unsafe realpaths still produce `NODE_PATH_INVALID`. Existing packages continue
through realpath containment and manifest checks.

Regression tests: 7/7 PASS. TypeScript: 0 errors. Phase 8 security tests: 3/3
PASS. Managed Node 24.21.0 + PNPM 10.34.5 focused build and verify: PASS,
including the fsevents classification above.

Several fresh arm64 acceptance attempts reached and passed the PNPM environment,
Node/ESM/tsx tasks, missing-runtime fail-closed and container replacement gates.
The latest clean run stopped earlier at Managed Python 3.13.15 source download:
three bounded 300-second curl attempts timed out after receiving only roughly
4–5 MB of the 23 MB archive (`curl (28)`). Cleanup passed. Phase 16B remains
PARTIAL; no PASS is claimed by stitching runs together.
