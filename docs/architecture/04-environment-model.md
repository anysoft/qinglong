# Execution environment model

Scoped ENV and dependency Environment are different resources:

- Scoped ENV resolves Global values, Repository profile and Task overrides, with
  explicit UNSET and secret metadata. Empty is different from missing/unset.
- Python/Node Environment owns desired dependency revisions and immutable resolved
  Builds. A Task explicitly binds a compatible Environment/Build; the platform
  does not infer a package layout from repository files or global installations.

ExecutionResolver freezes the full ENV map and validated resource bindings in
ExecutionContext. Retries use that snapshot. A BEFORE Hook may produce a validated
patch for its attempt; it cannot mutate the frozen baseline for later attempts.
Literal values never become shell source, language preload files or command
substitution. Secret masking applies to process logs, errors and artifacts.

Runtime/Build executable paths are absolute and pinned by leases. Host interpreter,
NODE_PATH/PYTHONPATH global prefix and implicit SDK fallbacks are absent from the
normal path. Config assets and Hooks have their own immutable content and lifecycle
contracts rather than being sourced platform settings.

Formal coverage includes complex values in Shell, managed Python, Node ESM and tsx,
UNSET, large/multiline values, masking, 50 concurrent live resolutions and settings
changed from A to B while existing runs retain A. See architecture documents 09–14.
