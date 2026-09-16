# Phase 6 graph / manual scope review

GitNexus 1.6.12 reindexed the workspace (9670 nodes, 24327 edges, 453 flows). `graph-review.cjs` calls the same LocalBackend detect_changes implementation as CLI and writes all structured results; it uses a private temporary Git index to include untracked new files without staging user work.

HEAD and develop currently resolve to the Phase 5 checkpoint. Structured detection returns 387 changed symbols, 52 affected processes (CRITICAL); all 387 symbols and all 52 flows are retained in JSON. The human CLI summary intentionally shows only 15 symbols/10 flows and must not be mistaken for the full evidence.

The index itself reports 801 excluded entry-point candidates, 771 dropped callees, 30 bounded walks and 4 depth caps. Therefore graph coverage is not exhaustive even when detect_changes has no partial flag. Name fallback can connect `root`, `request`, `RuntimeError` to repository/prepare flows; no such edge is used as proof that unchanged code was edited or isolated. Critical risk is explicitly reported to the user.

Manual verification: `static-audit.cjs` compares protected Task preparation/workspace/config/dependence and shell task/otask/process supervisors against platform-phase5. No differences. Production edits outside new Runtime modules are schema/db registration, API registration/parser error namespace and menu/title. Phase 5 schema fixtures/test expectations evolve to latest v3 without dropping previous migration or runtime assertions. Full platform release tests remain active.

New Runtime gets only its own Provider lease and short database transactions; no Config/Worktree lease or GitCredential/Task ENV import. The new subprocess helper reuses existing process supervision unchanged. Frontend contains no Task/Hook Runtime selector. These manual checks and executable regressions supplement the graph's unresolved edges.
