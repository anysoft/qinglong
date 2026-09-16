#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
# Dedicated bootstrap: apt changes are not transactionally reversible.
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { printf 'Ubuntu 24.04 required\n' >&2; exit 1; }
command -v flock >/dev/null
ci_lock_dir="${TMPDIR:-/tmp}/platform-ci-apt-${UID}"
if ! mkdir -m 700 -- "$ci_lock_dir" 2>/dev/null; then
  [[ ! -L "$ci_lock_dir" && -d "$ci_lock_dir" && "$(stat -c %u:%a -- "$ci_lock_dir")" == "$UID:700" ]] || { printf 'Unsafe CI lock directory\n' >&2; exit 1; }
fi
[[ ! -L "$ci_lock_dir/lock" ]] || exit 1
exec 9>"$ci_lock_dir/lock"
flock -w 600 9
privilege=()
if [[ "$EUID" -ne 0 ]]; then privilege=(sudo -n); fi
trap 'printf "System dependency installation failed (line %s)\n" "$LINENO" >&2' ERR
trap 'exit 130' INT
trap 'exit 143' TERM
packages=(build-essential ca-certificates curl git openssh-client openssl python3 jq perl util-linux coreutils tar gzip xz-utils sqlite3 shellcheck libssl-dev zlib1g-dev libbz2-dev libreadline-dev libsqlite3-dev libffi-dev liblzma-dev libncurses-dev uuid-dev)
missing=()
for package in "${packages[@]}"; do
  if ! dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q '^install ok installed$'; then missing+=("$package"); fi
done
if ((${#missing[@]})); then
  "${privilege[@]}" apt-get -o DPkg::Lock::Timeout=600 update
  "${privilege[@]}" env DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 install -y --no-install-recommends "${missing[@]}"
fi
