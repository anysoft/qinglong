#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly PID_PATTERN='node scripts/release/container-acceptance.cjs'
readonly LOG_FILE="${ROOT}/diagnostics/phase16b/container-acceptance-arm64-final.log"
readonly REPORT_FILE="${ROOT}/release-output/acceptance.json"
readonly INTERVAL_SECONDS="${INTERVAL_SECONDS:-15}"

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
notify_done() {
  local message="$1"
  printf '[%s] %s\n' "$(timestamp)" "$message"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"${message//\"/\\\"}\" with title \"QingLong Phase16B\"" >/dev/null 2>&1 || true
  fi
}
cleanup() { :; }
trap cleanup EXIT
trap 'exit 130' INT TERM

main() {
  while pgrep -f "$PID_PATTERN" >/dev/null 2>&1; do
    local last
    last=''
    if [[ -f "$LOG_FILE" ]]; then
      last="$(tail -n 1 "$LOG_FILE")"
    fi
    printf '[%s] acceptance still running%s\n' "$(timestamp)" "${last:+; last=${last}}"
    sleep "$INTERVAL_SECONDS"
  done

  if [[ -f "$REPORT_FILE" ]]; then
    local status cleanup_status
    status="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("status","UNKNOWN"))' "$REPORT_FILE")"
    cleanup_status="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("cleanup","UNKNOWN"))' "$REPORT_FILE")"
    notify_done "完整验收结束：status=${status}, cleanup=${cleanup_status}"
  else
    notify_done '验收进程结束，但未生成 acceptance.json，请检查日志'
  fi
}

main "$@"
