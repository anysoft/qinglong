# Runtime qualification

The local managed fixture provisioned real CPython 3.13.15 through pyenv 2.8.5 and
Node 24.21.0. Existing locked Environment tests exercised Python venv and Node
package-manager Builds, reuse, rebuild, offline cache and lifecycle safety. No fake
interpreter or hand-written READY record substitutes for these tests.

Initial real managed results: Environment 3/3, Execution 2/2, Shell 5/5, all with
zero skips. Final execution is rerun after bridge removal and recorded separately
in `managed-local/tests/managed-execution-final.json` before scrubbed export.

The managed Python, Node ESM and tsx executions now invoke the Phase15 complex ENV
contract: spaces, empty strings, Unicode, multiline/large values, literal shell
metacharacters, UNSET, no command substitution, private-result verification and
log masking. Shell uses the same formal Task→Resolver→Runner contract.

Build leases, pinned revisions, host isolation, deletion protection and recovery
remain covered by Phase7/8/10 tests. `Environment` is an explicit dependency
resource; no global Node/Python installer or automatic host fallback remains.
The initial provisioning and all subsequent builds are local Darwin evidence.
Ubuntu managed qualification must run again on the new commit through Foundation full.
