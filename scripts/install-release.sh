#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${SHP_RUNTIME_ROOT:-/opt/simplehost/spanel}"
version="${1:-$(node -e "const fs=require('node:fs'); console.log(JSON.parse(fs.readFileSync('${repo_root}/package.json','utf8')).version)")}"
release_dir="${runtime_root}/releases/${version}"
temp_dir="${release_dir}.tmp.$$"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install Node.js, npm, and pnpm first." >&2
  exit 1
fi

rm -rf "${temp_dir}"
install -d "${runtime_root}/releases" "${runtime_root}/shared" /etc/spanel /var/log/spanel
cp -a "${repo_root}/." "${temp_dir}"
rm -rf "${temp_dir}/.git" "${temp_dir}/node_modules"

(
  cd "${temp_dir}"
  pnpm install --frozen-lockfile
  pnpm build
)

rm -rf "${release_dir}"
mv "${temp_dir}" "${release_dir}"
ln -sfn "${release_dir}" "${runtime_root}/current"

install -m 0644 "${repo_root}/packaging/systemd/spanel-api.service" /etc/systemd/system/spanel-api.service
install -m 0644 "${repo_root}/packaging/systemd/spanel-web.service" /etc/systemd/system/spanel-web.service
install -m 0644 "${repo_root}/packaging/systemd/spanel-worker.service" /etc/systemd/system/spanel-worker.service
install -m 0644 "${repo_root}/packaging/env/spanel-api.env.example" /etc/spanel/api.env.example
install -m 0644 "${repo_root}/packaging/env/spanel-web.env.example" /etc/spanel/web.env.example
install -m 0644 "${repo_root}/packaging/env/spanel-worker.env.example" /etc/spanel/worker.env.example
systemctl daemon-reload

echo "Installed SHP release ${version} into ${release_dir}"
