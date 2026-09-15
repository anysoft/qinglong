#!/usr/bin/env bash

# Sourced only by task.sh. No changes to parent service environment or shared ENV files.
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
      PATH|HOME|LANG|LC_*|TMPDIR|TZ|TERM|QL_DIR|QL_DATA_DIR|QL_LANGUAGE|PLATFORM_MAIN_ONLY|PLATFORM_TASK_ID|PLATFORM_HOOK_PHASE|PLATFORM_WORKSPACE_ROOT|PLATFORM_TASK_DIR|PLATFORM_LEASE_FDS|QL_TASK_ENV_SNAPSHOT|QL_NODE_GLOBAL_PATH|QL_SCHEDULER|ID|SUB_ID|dir_*|file_*|cmd_*|PREV_*|work_dir|real_time|real_log_path|no_tee|log_path|log_dir|log_name|envParam|numParam|BASHOPTS|SHELLOPTS|UID|EUID|PPID) ;;
      *) unset "$name" ;;
    esac
  done < <(compgen -e)
  ql_task_env_apply
}
