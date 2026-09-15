# Full execution environment

Single precedence: Base allowlist → Global → Repository Profile → Task Override. Global names are unique. All scopes support literal values, SET/UNSET, disabled, empty and secret keep/replace/clear. The SDK bridge exposes the same Global store with masked values; numeric Global status remains its storage/protobuf representation, panel variable DTOs use enabled/disabled.

Resolver returns a frozen full map. Base permits PATH/HOME/LANG/LC_*/TMPDIR/TZ/TERM/QL_DIR/QL_DATA_DIR. Task shell removes other inherited exports before user code, retaining explicit Runner bookkeeping. No JWT/internal backend tokens inherit into scripts. Each execution, including global-only/no-ID, gets a private 0700 directory and 0600 files; owner PID and stale cleanup remain. Existing snapshots do not change when config changes. Preload retains hooks, SDK, dependency resolution, signals and account splitting.

Removed Global env.sh/js/py generation, imports and per-run copies. environment.sh is a private literal full snapshot, not shared generated configuration. shell/env.sh remains operations runtime helper. TypeScript uses explicit CommonJS/node runtime defaults; full transport must not depend on inherited backend TS_NODE configuration.

Validation: 21 passing security/domain/transport/Fresh/real execution tests; actual JS/Python/Shell/TS preserve whitespace, Unicode, injection-looking literals, multiline and empty values. Barrier requires all 50 child scripts to be live together across 50 repository/profile/task contexts before release; old A/new B and parent isolation pass. SDK/REST/preview/log redaction and account mode pass. Generated files are no longer written or consumed.
