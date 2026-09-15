#!/usr/bin/env bash

dir_shell=$QL_DIR/shell
. $dir_shell/share.sh
. $dir_shell/api.sh

trap 'single_hanle SIGINT'  INT
trap 'single_hanle SIGTERM' TERM
trap 'single_hanle SIGHUP'  HUP
trap 'single_hanle SIGALRM' ALRM
trap 'single_hanle SIGTSTP' TSTP
trap 'single_hanle SIGQUIT' QUIT

single_hanle() {
  if [[ -n ${platform_child_pid:-} ]]; then
    kill -TERM "$platform_child_pid" 2>/dev/null || true
    wait "$platform_child_pid" 2>/dev/null || true
    return
  fi
  _task_exit_code=143
  exit 143
}

define_program() {
  local file_param=$1
  if [[ $file_param == *.js ]] || [[ $file_param == *.mjs ]]; then
    which_program="node"
  elif [[ $file_param == *.py ]] || [[ $file_param == *.pyc ]]; then
    which_program="python3"
  elif [[ $file_param == *.sh ]]; then
    which_program="."
  elif [[ $file_param == *.ts ]]; then
    which_program="ts-node-transpile-only"
  else
    which_program=""
  fi
}

handle_log_path() {
  local file_param=$1

  if [[ -z $file_param ]]; then
    file_param="task"
  fi

  local suffix=""
  if [[ ! -z $ID ]]; then
    if [[ "$ID" -gt 0 ]] 2>/dev/null; then
      suffix="_${ID}"
    else
      ID=""
    fi
  fi

  if [[ $is_macos -ne 1 && $mtime_format == '%Y-%m-%d %H:%M:%S.%3N' ]]; then
    # Render both representations from one clock snapshot, without parsing it
    # again in a second date process.
    IFS='|' read -r time log_time < <(date "+$mtime_format|%Y-%m-%d-%H-%M-%S-%3N")
  else
    time=$(date "+$mtime_format")
    log_time=$(format_log_time "$mtime_format" "$time")
  fi
  if [[ -z $log_name ]]; then
    log_dir_tmp="${file_param##*/}"
    if [[ $file_param =~ "/" ]]; then
      if [[ $file_param == /* ]]; then
        log_dir_tmp_path="${file_param:1}"
      else
        log_dir_tmp_path="${file_param}"
      fi
    fi
    log_dir_tmp_path="${log_dir_tmp_path%/*}"
    log_dir_tmp_path="${log_dir_tmp_path##*/}"
    [[ $log_dir_tmp_path ]] && log_dir_tmp="${log_dir_tmp_path}_${log_dir_tmp}"
    log_dir="${log_dir_tmp%.*}${suffix}"
  else
    log_dir="$log_name"
  fi
  log_path="$log_dir/$log_time.log"

  if [[ ${real_log_path:=} ]]; then
    log_path="$real_log_path"
  fi

  cmd="2>&1 | tee -a $dir_log/$log_path"
  make_dir "$dir_log/$log_dir"
  if [[ "${no_tee:=}" == "true" ]]; then
    cmd=">> $dir_log/$log_path 2>&1"
  fi

  if [[ "${real_time:=}" == "true" ]]; then
    cmd=""
  fi

  if [[ "${log_dir:=}" == "/dev/null" ]]; then
    cmd=">> /dev/null"
    log_path="/dev/null"
  fi
}

format_params() {
  time_format="%Y-%m-%d %H:%M:%S"
  if [[ $is_macos -eq 1 ]]; then
    mtime_format=$time_format
  else
    mtime_format="%Y-%m-%d %H:%M:%S.%3N"
  fi
  timeoutCmd=""
  if [[ $command_timeout_time ]]; then
    if type timeout &>/dev/null; then
      timeoutCmd="timeout --foreground -s 2 -k 10s $command_timeout_time "
    fi
  fi
  # params=$(echo "$@" | sed -E 's/([^ ])&([^ ])/\1\\\&\2/g')

  # 分割 task 内置参数和脚本参数
  task_shell_params=()
  script_params=()
  found_double_dash=false

  for arg in "$@"; do
    if $found_double_dash; then
      script_params+=("$arg")
    elif [ "$arg" == "--" ]; then
      found_double_dash=true
    else
      task_shell_params+=("$arg")
    fi
  done
}

init_begin_time() {
  if [[ $is_macos -ne 1 && $mtime_format == '%Y-%m-%d %H:%M:%S.%3N' && $time_format == '%Y-%m-%d %H:%M:%S' ]]; then
    begin_time=${time%.*}
  else
    begin_time=$(format_time "$time_format" "$time")
  fi
  begin_timestamp=$(format_timestamp "$time_format" "$time")
}

import_config "$@"
while getopts ":lm:" opt; do
  case $opt in
  l)
    show_log="true"
    ;;
  m)
    max_time="$OPTARG"
    ;;
  esac
done
[[ ${show_log:=} ]] && shift $(($OPTIND - 1))
if [[ ${max_time:=} ]]; then
  shift $(($OPTIND - 1))
  command_timeout_time="$max_time"
fi

format_params "$@"
define_program "${task_shell_params[@]}"
if [[ ${PLATFORM_MAIN_ONLY:-} == 1 ]]; then
  . "$dir_shell/task_env.sh"
  file_env="$QL_TASK_ENV_SNAPSHOT/environment.sh"
  ql_task_env_isolate
  timeoutCmd=""
  . "$dir_shell/otask.sh"
  exit $?
fi

handle_log_path "${task_shell_params[@]}"
init_begin_time

platform_execute() {
  handle_task_start "${task_shell_params[@]}"
  local task_id=0
  [[ ${ID:-} =~ ^[1-9][0-9]*$ ]] && task_id=$ID
  local executable="$dir_root/static/build/taskExecution.js"
  node "$executable" "$task_id" "${command_timeout_time:-0}" "${task_shell_params[@]}" -- "${script_params[@]}" &
  platform_child_pid=$!
  wait "$platform_child_pid"
  local result=$?
  # An interrupted wait may finish before the child has completed FINALLY/CLEANUP.
  if kill -0 "$platform_child_pid" 2>/dev/null; then wait "$platform_child_pid"; result=$?; fi
  _task_exit_code=$result
  unset platform_child_pid
  handle_task_end "${task_shell_params[@]}"
  return "$result"
}
# Keep the lifecycle owner in this shell so direct SIGTERM reaches it even when
# logs are teed. A pipeline would put platform_execute in a separate subshell.
if [[ ${log_dir:-} == /dev/null ]]; then
  platform_execute >/dev/null 2>&1
  result=$?
elif [[ ${real_time:-} == true ]]; then
  platform_execute
  result=$?
elif [[ ${no_tee:-} == true ]]; then
  platform_execute >>"$dir_log/$log_path" 2>&1
  result=$?
else
  exec 3> >(tee -a "$dir_log/$log_path")
  platform_tee_pid=$!
  platform_execute >&3 2>&1
  result=$?
  exec 3>&-
  wait "$platform_tee_pid"
fi
exit "$result"
