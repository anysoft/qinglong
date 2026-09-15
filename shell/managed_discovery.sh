#!/usr/bin/env bash
# Internal staging adapter. No live scripts or Task API mutations are permitted here.
# Lock/process lifetime and staging cleanup are owned by the Phase 2 supervisor.
set -Eeuo pipefail
umask 077
[[ $# -eq 9 ]] || exit 64
source_dir=$1
stage_dir=$2
uniq_path=$3
include=$4
exclude=$5
dependences=$6
extensions=$7
auto_add=$8
auto_delete=$9
[[ "$stage_dir" = /* && -d "$stage_dir" && ! -L "$stage_dir" ]] || exit 65
[[ "$source_dir" = /* && -d "$source_dir" && ! -L "$source_dir" ]] || exit 65
for tool in find grep perl awk sed jq cp; do command -v "$tool" >/dev/null || exit 69; done
failure_marker="$stage_dir/failed"
trap 'printf "%s\n" "DISCOVERY_FAILED" > "$failure_marker"' ERR
trap 'exit 130' INT TERM
# Existing config is executable by design. Do not change its legacy option semantics.
set +eu
. "$QL_DIR/shell/share.sh"
import_config repo
QL_DISCOVERY_LIBRARY_ONLY=1 . "$QL_DIR/shell/update.sh"
set +u
# The caller supplies private copies of crontab.list and the scripts destination.
# Keep configured default_cron/file_extensions and the original scanner unchanged.
cmd_task=task
dir_scripts="$stage_dir/scripts"
dir_list_tmp="$stage_dir/lists"
list_crontab_user="$stage_dir/crontab.list"
mkdir -p "$dir_scripts/$uniq_path" "$dir_list_tmp/$(dirname "$uniq_path")"
: > "$stage_dir/add.jsonl"
: > "$stage_dir/drop.jsonl"
: > "$stage_dir/notifications.jsonl"
# Legacy functions intentionally use grep's status 1 and split validated file names.
# Record actual write failures explicitly rather than enabling errexit inside them.
cp() {
  # An empty deps directory produces this literal glob in the old scanner.
  [[ "$#" -eq 3 && "$2" == "$dir_dep/*" && ! -e "$2" ]] && return 0
  command cp "$@" || { printf '%s\n' COPY_FAILED > "$failure_marker"; return 1; }; }
mkdir() { command mkdir "$@" || { printf '%s\n' COPY_FAILED > "$failure_marker"; return 1; }; }
rm() { command rm "$@" || { printf '%s\n' DISCOVERY_FAILED > "$failure_marker"; return 1; }; }
cd() { builtin cd "$@" || { printf '%s\n' DISCOVERY_FAILED > "$failure_marker"; return 1; }; }
find() { command find "$@" || { printf '%s\n' DISCOVERY_FAILED > "$failure_marker"; return 1; }; }
make_dir() { command mkdir -p "$1" || { printf '%s\n' COPY_FAILED > "$failure_marker"; return 1; }; }
add_cron_api() {
  local schedule command name sub_id
  schedule=$(printf '%s\n' "$1" | awk -F ':' '{print $1}')
  command=$(printf '%s\n' "$1" | awk -F ':' '{print $2}')
  name=$(printf '%s\n' "$1" | awk -F ':' '{print $3}')
  sub_id=$(printf '%s\n' "$1" | awk -F ':' '{print $4}')
  jq -cn --arg name "$name" --arg command "$command" --arg schedule "$schedule" --argjson sub_id "$sub_id" '{name:$name,command:$command,schedule:$schedule,sub_id:$sub_id}' >> "$stage_dir/add.jsonl" || printf '%s\n' DISCOVERY_FAILED > "$failure_marker"
  printf '%s -> 添加成功\n' "$name"
}
del_cron_api() { printf '[%s]\n' "$1" | jq -c . >> "$stage_dir/drop.jsonl" || printf '%s\n' DISCOVERY_FAILED > "$failure_marker"; }
notify_api() { jq -cn --arg title "$1" --arg content "$2" '{title:$title,content:$content}' >> "$stage_dir/notifications.jsonl" || printf '%s\n' DISCOVERY_FAILED > "$failure_marker"; }
# Validate regex syntax before any staging copy. No match (1) is valid; syntax errors (2) are not.
for expression in "$include" "$exclude" "$dependences"; do
  if [[ -n "$expression" ]]; then
    printf '\n' | grep -E -- "$expression" >/dev/null 2>&1
    status=$?
    [[ $status -lt 2 ]] || exit 65
  fi
done
# Clear benign grep ERR markers before the legacy routine. Only explicit cp/mkdir failures set it below.
rm -f "$failure_marker"
trap - ERR
set +e
# A private copy of existing scripts permits unchanged del_cron metadata extraction and removal.
diff_scripts "$source_dir" '' "$include" "$exclude" "$dependences" "$extensions" "$auto_add" "$auto_delete"
[[ ! -e "$failure_marker" ]] || exit 74
printf '%s\n' complete > "$stage_dir/complete"
