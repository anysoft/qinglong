# Raw TypeScript convergence

Entry raw compiler output contained 22 diagnostics. Eighteen were missing Umi
generated development exports: this checkout had `.umi-production` but no `.umi`.
The supported `max setup` step regenerated actual exports; no declaration shim,
`tsconfig` weakening or wildcard module was added. Existing CI dependency setup
already invokes the same generator for clean checkouts.

Four source diagnostics were implicit callback parameters:

- Tag input and log search use `React.ChangeEvent<HTMLInputElement>`.
- Security upload uses Ant Design's `UploadChangeParam<UploadFile<...>>`.
- Diff tree selection treats metadata as `unknown` and narrows its actual
  `extra.target` string before reading it.

`scripts/ci/typecheck-baseline.json` is removed. CI runs the raw compiler and
requires both exit success and zero parsed diagnostics. Summaries reject old
budget-shaped evidence, nonzero errors, failed compiler and missing evidence.
Historical reports retain their original error counts.

Reproduction after dependency installation:

```sh
node node_modules/@umijs/max/bin/max.js setup
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --pretty false
```

`diagnostics/phase15/typecheck-before.log` records 22 diagnostics;
`typecheck-after.log` is empty on successful raw checks. A Linux hosted check of
the final commit is still required independently of the local result.


The retired `/diff` page was subsequently found to call removed `configs/detail`,
`configs/save` and `configs/samples` endpoints and default to config.sh. It and its
old shell/QLAPI examples are physically removed as part of Config/Script domain
consolidation; Worktree Git diff is the supported comparison path. Its earlier
callback type fix is therefore absent from the final source. This removal is not
an error-baseline exclusion: the route had no live controller, and raw tsc still
runs against the entire current frontend.
