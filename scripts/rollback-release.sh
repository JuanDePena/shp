#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: rollback-release.sh <version>}"
runtime_root="${SHP_RUNTIME_ROOT:-/opt/simplehost/spanel}"
release_dir="${runtime_root}/releases/${version}"

if [[ ! -d "${release_dir}" ]]; then
  echo "Release ${release_dir} does not exist." >&2
  exit 1
fi

ln -sfn "${release_dir}" "${runtime_root}/current"
systemctl try-restart spanel-api.service spanel-web.service spanel-worker.service || true

echo "Rolled SHP current symlink back to ${release_dir}"
