<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **qinglong** (2778 symbols, 6698 relationships, 233 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "develop"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/qinglong/context` | Codebase overview, check index freshness |
| `gitnexus://repo/qinglong/clusters` | All functional areas |
| `gitnexus://repo/qinglong/processes` | All execution flows |
| `gitnexus://repo/qinglong/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->


## Greenfield platform direction — Phase 4.5A

This project is now a greenfield-only Git-native script automation / scheduling platform.

- Support fresh installation, fresh database, fresh configuration, repository and task setup.
- Do not add QingLong backward compatibility or legacy migration paths unless explicitly requested.
- Prefer the target platform architecture over old implementation semantics.
- Phase 0–4 reports and docs/refactor/phase1..4 are Historical Refactor Records, not current compatibility requirements.
- Preserve security, data integrity, locks/leases, recovery and active runtime responsibilities. Fresh-only never authorizes deleting existing user data.
- New modules must not add dependencies on legacy path naming, scripts staging internals, generated language ENV, global dependency layouts or Shell→Open API contracts.
- Keep temporary bridges until their consumers have replacements and their exit gates pass. Review [TEMPORARY_BRIDGES.md](TEMPORARY_BRIDGES.md), [GREENFIELD_REMOVAL_PLAN.md](GREENFIELD_REMOVAL_PLAN.md) and [architecture ADRs](docs/architecture/adr/ADR-001-fresh-install-only.md).
- Phase 4.5A authorizes documentation/diagnostics only. Execute cleanup only under a subsequent explicit task. GitNexus requirements above remain in force.
