#!/usr/bin/env bash

days=$1

remove_js_log() {
  # TaskRun logs have their own retention domain (automatic deletion is OFF).
  [[ -n ${dir_log:-} && "$dir_log" = /* && "$dir_log" != / && ! -L "$dir_log" ]] || return 1
  local diff_time log
  while IFS= read -r -d '' log; do
    local log_date=$(echo $log | awk -F "/" '{print $NF}' | cut -c1-10)
    if ! [[ $log_date =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      if [[ $is_macos -eq 1 ]]; then
        log_date=$(stat -f %Sm -t "%Y-%m-%d" "$log")
      else
        log_date=$(stat -c %y "$log" | cut -d ' ' -f 1)
      fi
    fi
    if [[ $is_macos -eq 1 ]]; then
      diff_time=$(($(date +%s) - $(date -j -f "%Y-%m-%d" "$log_date" +%s)))
    else
      diff_time=$(($(date +%s) - $(date +%s -d "$log_date")))
    fi
    if [[ $diff_time -gt $((${days} * 86400)) ]]; then
      local log_path=$(echo "$log" | sed "s,${dir_log}/,,g")
      local result=$(find_cron_api "log_path=$log_path")
      t '查询文件 %s' "$log_path"
      if [[ -z $result ]]; then
        t '删除中~'
        rm -vf -- "$log"
      else
        t '正在被 %s 使用，跳过~' "$result"
      fi
    fi
  done < <(find "$dir_log" -path "$dir_log/task-runs" -prune -o -type f -name "*.log" -print0)
}

remove_empty_dir() {
  cd "$dir_log" || return 1
  for dir in $(ls); do
    [[ "$dir" == task-runs ]] && continue
    if [[ -d $dir ]] && [[ -z $(ls $dir) ]]; then
      rm -rf $dir
    fi
  done
}

if [[ ${days} =~ ^[0-9]+$ ]]; then
  t '查找旧日志文件中...\n'
  remove_js_log
  remove_empty_dir
  t '删除旧日志执行完毕\n'
fi
