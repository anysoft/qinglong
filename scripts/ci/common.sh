#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
CI_REPOSITORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
export CI_REPOSITORY
cd -- "$CI_REPOSITORY"
# No environment dumps or command traces: arguments may contain fixture secrets.
trap 'printf "CI command failed at line %s (exit %s)\n" "$LINENO" "$?" >&2' ERR
trap 'exit 130' INT
trap 'exit 143' TERM
ci_node() { node "$CI_REPOSITORY/scripts/ci/ci.cjs" "$@"; }
