#!/usr/bin/env bash

# Sourced only by task.sh. No changes to parent service environment or shared ENV files.
ql_task_env_prepare() {
  if [[ -n ${QL_TASK_ENV_SNAPSHOT:-} ]]; then
    return 0
  fi
  [[ ${ID:-} =~ ^[1-9][0-9]*$ ]] || return 0
  # Standalone legacy CLI installations without a database retain the legacy path.
  [[ -f "$dir_data/db/database.sqlite" ]] || return 0
  local snapshot
  if [[ -f "$dir_root/static/build/taskEnvironment.js" ]]; then
    snapshot=$(node "$dir_root/static/build/taskEnvironment.js" "$ID" "$$") || return 1
  else
    snapshot=$(ts-node-transpile-only "$dir_root/back/taskEnvironment.ts" "$ID" "$$") || return 1
  fi
  if [[ -n "$snapshot" ]]; then
    export QL_TASK_ENV_SNAPSHOT="$snapshot"
    trap ql_task_env_cleanup EXIT
  fi
}

ql_task_env_cleanup() {
  local snapshot=${QL_TASK_ENV_SNAPSHOT:-}
  if [[ "$snapshot" == "$dir_root/.tmp/task-env/"run-* && -d "$snapshot" && ! -L "$snapshot" ]]; then
    rm -rf -- "$snapshot"
  fi
}

ql_task_env_apply() {
  [[ -n ${QL_TASK_ENV_SNAPSHOT:-} ]] || return 0
  . "$QL_TASK_ENV_SNAPSHOT/overlay.sh"
}
