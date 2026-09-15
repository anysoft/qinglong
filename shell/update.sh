#!/usr/bin/env bash

dir_shell=$QL_DIR/shell
. $dir_shell/share.sh
. $dir_shell/api.sh
load_ql_envs
. $dir_shell/env.sh

send_mark=$dir_shell/send_mark

## 检测cron的差异，$1：脚本清单文件路径，$2：cron任务清单文件路径，$3：增加任务清单文件路径，$4：删除任务清单文件路径

## 输出是否有新的或失效的定时任务，$1：新的或失效的任务清单文件路径，$2：新/失效

## 自动删除失效的脚本与定时任务，需要：1.AutoDelCron 设置为 true；2.正常更新js脚本，没有报错；3.存在失效任务
## $1：失效任务清单文件路径

## $1：新任务清单文件路径

## 更新仓库

## 更新所有 raw 文件

## 调用用户自定义的extra.sh
run_extra_shell() {
  if [[ -f $file_extra_shell ]]; then
    . $file_extra_shell
  else
    t '%s文件不存在，跳过执行...\n' "$file_extra_shell"
  fi
}

## 查看青龙服务日志
show_service_logs() {
  local lines="15"
  local no_stream="false"
  while [[ $# -gt 0 ]]; do
    case "$1" in
    --lines)
      if [[ ! "${2:-}" =~ ^[0-9]+$ ]]; then
        echo "ql log: --lines requires a non-negative integer" >&2
        return 2
      fi
      lines="$2"
      shift 2
      ;;
    --lines=*)
      lines="${1#--lines=}"
      if [[ ! "$lines" =~ ^[0-9]+$ ]]; then
        echo "ql log: --lines requires a non-negative integer" >&2
        return 2
      fi
      shift
      ;;
    --nostream)
      no_stream="true"
      shift
      ;;
    *)
      echo "ql log: unknown option: $1" >&2
      return 2
      ;;
    esac
  done

  local system_log_dir="$dir_data/syslog"
  local latest_system_log
  latest_system_log=$(ls -1t "$system_log_dir"/*.log* 2>/dev/null | head -n 1)
  if [[ "$lines" != "0" ]] && [[ -f "$latest_system_log" ]]; then
    tail -n "$lines" "$latest_system_log"
  fi

  if [[ "$no_stream" == "true" ]]; then
    if [[ -z "$latest_system_log" ]]; then
      echo "ql log: no system log found in $system_log_dir" >&2
      return 1
    fi
    return 0
  fi

  # Winston writes the active runtime log by date. Follow the filename so
  # size-based rotations are handled without involving the PM2 log files.
  local current_system_log="$system_log_dir/$(date +%F).log"
  tail -n 0 --retry -F "$current_system_log"
}

## 脚本用法
usage() {
  t "$cmd_update 命令使用方法："
  echo -e "1.  $cmd_update update                                                                  # 更新并重启青龙"
  echo -e "2.  $cmd_update extra                                                                   # 运行自定义脚本"
  echo -e "5.  $cmd_update rmlog <days>                                                            # 删除旧日志"
  echo -e "7.  $cmd_update check                                                                   # 检测青龙环境并修复"
  echo -e "8.  $cmd_update log [--lines <n>] [--nostream]                                         # 查看青龙运行日志"
  echo -e "9.  $cmd_update resetlet                                                                # 重置登录错误次数"
  echo -e "10. $cmd_update resettfa                                                                # 禁用两步登录"
  echo -e "11. $cmd_update resetpwd                                                                # 修改登录密码"
  echo -e "12. $cmd_update resetname                                                               # 修改登录用户名"
}

reload_qinglong() {
  echo -e "[reload_qinglong] deleting Triggered at $(date)" >>${dir_log}/reload.log
  sleep 3
  delete_pm2
  echo -e "[reload_qinglong] deleted Triggered at $(date)" >>${dir_log}/reload.log

  local reload_target="${1}"
  local primary_branch="master"
  if [[ "${QL_BRANCH}" == "develop" ]] || [[ "${QL_BRANCH}" == "debian" ]] || [[ "${QL_BRANCH}" == "debian-dev" ]]; then
    primary_branch="${QL_BRANCH}"
  fi

  if [[ "$reload_target" == 'system' ]]; then
    rm -rf ${dir_root}/back ${dir_root}/cli ${dir_root}/docker ${dir_root}/sample ${dir_root}/shell ${dir_root}/src
    mv -f ${dir_tmp}/qinglong-${primary_branch}/* ${dir_root}/
    rm -rf $dir_static/*
    mv -f ${dir_tmp}/qinglong-static-${primary_branch}/* ${dir_static}/
    cp -f $file_config_sample $dir_config/config.sample.sh
  fi

  if [[ "$reload_target" == 'data' ]]; then
    rm -rf ${dir_data}/*
    mv -f ${dir_tmp}/data/* ${dir_data}/
  fi
  echo -e "[reload_qinglong] starting Triggered at $(date)" >>${dir_log}/reload.log
  reload_pm2
  echo -e "[reload_qinglong] started Triggered at $(date)\n" >>${dir_log}/reload.log
}

## 更新 qinglong
update_qinglong() {
  rm -rf ${dir_tmp}/*
  local mirror="gitee"
  local downloadQLUrl="https://gitee.com/whyour/qinglong/repository/archive"
  local downloadStaticUrl="https://gitee.com/whyour/qinglong-static/repository/archive"
  local githubStatus=$(curl -s --noproxy "*" -m 2 -IL "https://google.com" | grep 200)
  if [[ ! -z $githubStatus ]]; then
    mirror="github"
    downloadQLUrl="https://github.com/whyour/qinglong/archive/refs/heads"
    downloadStaticUrl="https://github.com/whyour/qinglong-static/archive/refs/heads"
  fi
  t '使用 %s 源更新...\n' "${mirror}"

  local primary_branch="master"
  if [[ "${QL_BRANCH}" == "develop" ]] || [[ "${QL_BRANCH}" == "debian" ]] || [[ "${QL_BRANCH}" == "debian-dev" ]]; then
    primary_branch="${QL_BRANCH}"
  fi

  wget -cqO "${dir_tmp}/ql.zip" "${downloadQLUrl}/${primary_branch}.zip"
  exit_status=$?

  if [[ $exit_status -eq 0 ]]; then
    t '更新青龙源文件成功...\n'

    unzip -oq ${dir_tmp}/ql.zip -d ${dir_tmp}

    update_qinglong_static
  else
    t '更新青龙源文件失败，请检查网络...\n'
  fi
}

update_qinglong_static() {
  wget -cqO "${dir_tmp}/static.zip" "${downloadStaticUrl}/${primary_branch}.zip"
  exit_status=$?

  if [[ $exit_status -eq 0 ]]; then
    t '更新青龙静态资源成功...\n'
    unzip -oq ${dir_tmp}/static.zip -d ${dir_tmp}

    check_update_dep
  else
    t '更新青龙静态资源失败，请检查网络...\n'
  fi
}

check_update_dep() {
  t '\n开始检测依赖...\n'
  if [[ $(diff $dir_root/package.json ${dir_tmp}/qinglong-${primary_branch}/package.json) ]]; then
    npm_install_2 "${dir_tmp}/qinglong-${primary_branch}"
  fi

  if [[ $exit_status -eq 0 ]]; then
    t '\n依赖检测安装成功...\n'
    t '更新包下载成功...\n'

    if [[ "$needRestart" == 'true' ]]; then
      reload_qinglong "system"
    fi
  else
    t '\n依赖检测安装失败，请检查网络...\n'
  fi
}

## 对比脚本

## 生成脚本的路径清单文件


main() {
  ## for ql update
  show_log="false"
  while getopts ":l" opt; do
    case $opt in
    l)
      show_log="true"
      ;;
    esac
  done
  [[ "$show_log" == "true" ]] && shift $(($OPTIND - 1))

  local p1="${1}"
  local p2="${2}"
  local p3="${3}"
  local p4="${4}"
  local p5="${5}"
  local p6="${6}"
  local p7="${7}"
  local p8="${8}"
  local p9="${9}"
  local p10="${10}"

  if [[ "$p1" == "log" ]]; then
    show_service_logs "${@:2}"
    return $?
  fi

  local log_dir="${p1}"
  make_dir "$dir_log/$log_dir"
  local log_time=$(date "+%Y-%m-%d-%H-%M-%S")
  local log_path="${log_dir}/${log_time}.log"
  local file_path="$dir_log/$log_path"

  cmd="2>&1 | tee -a $file_path"
  if [[ "$no_tee" == "true" ]]; then
    cmd=">> $file_path 2>&1"
  fi
  if [[ "$real_time" == "true" ]]; then
    cmd=""
  fi

  local time_format="%Y-%m-%d %H:%M:%S"
  local time=$(date "+$time_format")
  local begin_timestamp=$(format_timestamp "$time_format" "$time")

  local begin_time=$(format_time "$time_format" "$time")

  if true; then
    eval echo -e "\#\# 开始执行... $begin_time\\\n" $cmd
  fi

  [[ $ID ]] && update_cron "\"$ID\"" "0" "$$" "$log_path" "$begin_timestamp"

  case $p1 in
  update)
    fix_config
    local needRestart=${p2:-"true"}
    eval update_qinglong $cmd
    ;;
  reload)
    eval reload_qinglong "$p2" $cmd
    ;;
  extra)
    eval run_extra_shell $cmd
    ;;
  rmlog)
    eval . $dir_shell/rmlog.sh "$p2" $cmd
    ;;
  check)
    eval . $dir_shell/check.sh $cmd
    ;;
  resetlet)
    eval update_auth_config "\\\"retries\\\":0" "重置登录错误次数" $cmd
    ;;
  resettfa)
    eval update_auth_config "\\\"twoFactorActivated\\\":false" "禁用两步验证" $cmd
    ;;
  resetpwd)
    eval update_auth_config "\\\"password\\\":\\\"$p2\\\"" "重置密码" $cmd
    ;;
  resetname)
    eval update_auth_config "\\\"username\\\":\\\"$p2\\\"" "重置用户名" $cmd
    ;;
  *)
    t '命令输入错误...\n'
    eval usage $cmd
    ;;
  esac

  local etime=$(date "+$time_format")
  local end_time=$(format_time "$time_format" "$etime")
  local end_timestamp=$(format_timestamp "$time_format" "$etime")
  local diff_time=$(($end_timestamp - $begin_timestamp))
  [[ $ID ]] && update_cron "\"$ID\"" "1" "$$" "$log_path" "$begin_timestamp" "$diff_time"

  if true; then
    eval echo -e "\\\n\#\# 执行结束... $end_time  耗时 $diff_time 秒　　　　　" $cmd
  fi
}

import_config "$@"
main "$@"
exit 0
