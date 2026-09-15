#!/usr/bin/env bash

# Sourced only by task.sh. No changes to parent service environment or shared ENV files.
ql_task_env_prepare() {
  if [[ -n ${QL_TASK_ENV_SNAPSHOT:-} ]]; then
    return 0
  fi
  [[ -f "$dir_data/db/database.sqlite" ]] || return 1
  local task_id=0
  [[ ${ID:-} =~ ^[1-9][0-9]*$ ]] && task_id=$ID
  local snapshot
  if [[ -f "$dir_root/static/build/taskEnvironment.js" ]]; then
    snapshot=$(node "$dir_root/static/build/taskEnvironment.js" "$task_id" "$$") || return 1
  else
    snapshot=$(ts-node-transpile-only "$dir_root/back/taskEnvironment.ts" "$task_id" "$$") || return 1
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
  . "$QL_TASK_ENV_SNAPSHOT/environment.sh"
}

# Only runner bookkeeping may accompany the complete resolved child environment.
# This mutates this task process, never the backend parent.
ql_task_env_isolate() {
  local name
  while IFS= read -r name; do
    case "$name" in
      PATH|HOME|LANG|LC_*|TMPDIR|TZ|TERM|QL_DIR|QL_DATA_DIR|QL_LANGUAGE|QL_TASK_ENV_SNAPSHOT|QL_NODE_GLOBAL_PATH|QL_SCHEDULER|ID|SUB_ID|dir_*|file_*|cmd_*|PREV_*|task_before|task_after|work_dir|real_time|real_log_path|no_tee|log_path|log_dir|log_name|envParam|numParam|BASHOPTS|SHELLOPTS|UID|EUID|PPID) ;;
      *) unset "$name" ;;
    esac
  done < <(compgen -e)
  ql_task_env_apply
}
